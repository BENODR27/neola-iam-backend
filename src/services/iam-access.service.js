// ERP identity administration. Commercial entitlements remain owned by the control plane.
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const {
  User,
  Role,
  Permission,
  UserAccessScope,
  sequelize,
} = require("../models");
const HttpError = require("../errors/HttpError");
const localPermissions = [
  "IAM-APP",
  "users:manage",
  "roles:manage",
  "access-scopes:manage",
];
const includes = [
  {
    model: Role,
    as: "roles",
    through: { attributes: [] },
    include: [
      { model: Permission, as: "permissions", through: { attributes: [] } },
    ],
  },
  { model: UserAccessScope, as: "accessScopes", required: false },
];
const roleIncludes = [
  { model: Permission, as: "permissions", through: { attributes: [] } },
];
function names(user) {
  return (user.roles || [])
    .filter((r) => r.enabled)
    .flatMap((r) => r.permissions.filter((p) => p.enabled).map((p) => p.name));
}
function allowed(req) {
  return new Set([
    ...require("../security/master-permissions").expandMasterPermissions(
      req.user.subscriptionLicense.permissions,
    ),
    ...localPermissions.filter((p) =>
      req.user.subscriptionPermissions.includes(p),
    ),
  ]);
}
function checkPermissions(req, permissions) {
  const ceiling = allowed(req);
  if (permissions.some((p) => !p.enabled || !ceiling.has(p.name)))
    throw new HttpError(
      403,
      "Role permissions exceed the purchased access or your IAM administration grants",
    );
}
async function lock(transaction) {
  await sequelize.query("SELECT pg_advisory_xact_lock(70202028)", {
    transaction,
  });
}
async function preserveAdministrator(transaction) {
  const users = await User.findAll({
    where: { isActive: true },
    include: includes,
    transaction,
  });
  if (
    !users.some(
      (u) =>
        localPermissions.every((p) => names(u).includes(p)) ||
        names(u).includes("*"),
    )
  )
    throw new HttpError(
      409,
      "Keep at least one active IAM administrator with user, role and scope management",
    );
}
async function invalidateRole(role, transaction) {
  const users = await role.getUsers({ attributes: ["id"], transaction });
  if (users.length)
    await User.increment("sessionVersion", {
      by: 1,
      where: { id: users.map((u) => u.id) },
      transaction,
    });
}
async function roles(req) {
  const rows = await Role.findAll({
    include: roleIncludes,
    order: [["name", "ASC"]],
  });
  // Historical wildcard roles remain intact, but cannot be newly assigned through licensed IAM.
  return rows.filter(
    (r) => !r.permissions.some((p) => ["*", "superadmin"].includes(p.name)),
  );
}
async function permissions(req) {
  return Permission.findAll({
    where: { name: [...allowed(req)], enabled: true },
    order: [
      ["appname", "ASC"],
      ["name", "ASC"],
    ],
  });
}
async function saveRole(req, id) {
  const name = String(req.body.name || "").trim();
  if (
    !name ||
    name.length > 100 ||
    ["admin", "superadmin", "*"].includes(name.toLowerCase())
  )
    throw new HttpError(422, "Choose a role name of at most 100 characters");
  if (!Array.isArray(req.body.permissionIds))
    throw new HttpError(422, "Select role permissions");
  return sequelize.transaction(async (transaction) => {
    await lock(transaction);
    const selected = await Permission.findAll({
      where: { id: [...new Set(req.body.permissionIds)] },
      transaction,
    });
    if (selected.length !== new Set(req.body.permissionIds).size)
      throw new HttpError(422, "Unknown permission");
    checkPermissions(req, selected);
    const role = id
      ? await Role.findByPk(id, { transaction })
      : await Role.create({ name, enabled: true }, { transaction });
    if (!role) throw new HttpError(404, "Role not found");
    const previous = await role.getPermissions({ transaction });
    if (
      previous.some(
        (p) => localPermissions.includes(p.name) && !allowed(req).has(p.name),
      )
    )
      throw new HttpError(
        403,
        "This role contains IAM administration grants you cannot manage",
      );
    if (previous.some((p) => ["*", "superadmin"].includes(p.name)))
      throw new HttpError(
        403,
        "Historical installation roles are preserved; create an explicit IAM role",
      );
    if (role.name.startsWith("subscription:") && role.name !== name)
      throw new HttpError(
        422,
        "Keep the identity of a console-synchronized role; create another role to rename it",
      );
    await role.update({ name }, { transaction });
    await role.setPermissions(selected, { transaction });
    await preserveAdministrator(transaction);
    await invalidateRole(role, transaction);
    return Role.findByPk(role.id, { include: roleIncludes, transaction });
  });
}
async function roleStatus(req, id, enabled) {
  if (typeof enabled !== "boolean")
    throw new HttpError(422, "Choose an enabled status");
  await sequelize.transaction(async (transaction) => {
    await lock(transaction);
    const role = await Role.findByPk(id, {
      include: roleIncludes,
      transaction,
    });
    if (!role) throw new HttpError(404, "Role not found");
    checkPermissions(req, role.permissions);
    await role.update({ enabled }, { transaction });
    await preserveAdministrator(transaction);
    await invalidateRole(role, transaction);
  });
}
async function users() {
  return User.findAll({ include: includes, order: [["id", "ASC"]] });
}
async function saveUser(req, id) {
  const code = String(req.body.employeeCode || "").trim(),
    name = String(req.body.employeeName || "").trim();
  if (!code || !name || code.length > 180 || name.length > 180)
    throw new HttpError(
      422,
      "Username and display name are required (maximum 180 characters)",
    );
  const password = req.body.authCode;
  if (
    (!id && !password) ||
    (password &&
      (typeof password !== "string" ||
        password.length < 12 ||
        Buffer.byteLength(password) > 72))
  )
    throw new HttpError(
      422,
      "Password must contain at least 12 characters and at most 72 bytes",
    );
  if (!Array.isArray(req.body.roleIds) || !req.body.roleIds.length)
    throw new HttpError(422, "Choose at least one enabled role");
  const hash = password ? await bcrypt.hash(password, 12) : null;
  return sequelize.transaction(async (transaction) => {
    await lock(transaction);
    const selected = await Role.findAll({
      where: { id: [...new Set(req.body.roleIds)], enabled: true },
      include: roleIncludes,
      transaction,
    });
    if (selected.length !== new Set(req.body.roleIds).size)
      throw new HttpError(422, "Choose enabled roles");
    for (const role of selected) checkPermissions(req, role.permissions);
    let user = id
      ? await User.findByPk(id, { include: includes, transaction })
      : null;
    if (id && !user) throw new HttpError(404, "User not found");
    if (user) assertTarget(req, user);
    if (
      !id &&
      (await User.count({ where: { isActive: true }, transaction })) >=
        req.user.subscriptionLicense.max_users
    )
      throw new HttpError(409, "Subscription user limit reached");
    if (
      await User.count({
        where: {
          [Op.or]: [{ employeeCode: code }, { employeeName: name }],
          ...(id ? { id: { [Op.ne]: id } } : {}),
        },
        transaction,
      })
    )
      throw new HttpError(409, "Username or display name already exists");
    if (!user)
      user = await User.create(
        {
          employeeCode: code,
          employeeName: name,
          authCode: hash,
          isActive: true,
        },
        { transaction },
      );
    else
      await user.update(
        {
          employeeCode: code,
          employeeName: name,
          ...(hash ? { authCode: hash } : {}),
          sessionVersion: user.sessionVersion + 1,
        },
        { transaction },
      );
    await user.setRoles(selected, { transaction });
    await preserveAdministrator(transaction);
    return User.findByPk(user.id, { include: includes, transaction });
  });
}
function assertTarget(req, user) {
  const ceiling = allowed(req);
  if (
    names(user).some((p) => localPermissions.includes(p) && !ceiling.has(p)) ||
    names(user).includes("*")
  )
    throw new HttpError(
      403,
      "This account has protected installation administration grants",
    );
}
async function userStatus(req, id, enabled) {
  if (typeof enabled !== "boolean")
    throw new HttpError(422, "Choose an enabled status");
  await sequelize.transaction(async (transaction) => {
    await lock(transaction);
    const user = await User.findByPk(id, { include: includes, transaction });
    if (!user) throw new HttpError(404, "User not found");
    assertTarget(req, user);
    if (
      enabled &&
      !user.isActive &&
      (await User.count({ where: { isActive: true }, transaction })) >=
        req.user.subscriptionLicense.max_users
    )
      throw new HttpError(409, "Subscription user limit reached");
    await user.update(
      { isActive: enabled, sessionVersion: user.sessionVersion + 1 },
      { transaction },
    );
    await preserveAdministrator(transaction);
  });
}
async function scopes(req, id, values) {
  if (!Array.isArray(values))
    throw new HttpError(422, "Scopes must be an array");
  const normalized = values.map(
    require("./access-scope.service").normalizeScope,
  );
  for (const scope of normalized) {
    if (
      !scope.organizationId ||
      !scope.factoryId ||
      !req.user.subscriptionLicense.applications.some(
        (a) => a.code === scope.applicationName,
      )
    )
      throw new HttpError(
        422,
        "Select a licensed application and explicit company/factory IDs",
      );
    if (process.env.PLATFORM_MASTERS_MODE === "shared") {
      const factories = await require("./shared-masters").query(
        "SELECT id FROM app_shared_masters WHERE id::text=:id AND module='factories' AND organization_id=:org AND status='Active'",
        { id: scope.factoryId, org: scope.organizationId },
      );
      if (!factories.length)
        throw new HttpError(
          422,
          "Choose an active factory belonging to this company",
        );
    }
  }
  return sequelize.transaction(async (transaction) => {
    await lock(transaction);
    const user = await User.findByPk(id, { include: includes, transaction });
    if (!user) throw new HttpError(404, "User not found");
    assertTarget(req, user);
    await UserAccessScope.destroy({ where: { userId: id }, transaction });
    if (normalized.length)
      await UserAccessScope.bulkCreate(
        normalized.map((s) => ({ ...s, userId: id })),
        { transaction },
      );
    await user.increment("sessionVersion", { by: 1, transaction });
    return UserAccessScope.findAll({ where: { userId: id }, transaction });
  });
}
module.exports = {
  localPermissions,
  roles,
  permissions,
  saveRole,
  roleStatus,
  users,
  saveUser,
  userStatus,
  scopes,
};
