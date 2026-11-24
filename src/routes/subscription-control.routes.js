// Private management adapter for one dedicated customer installation. ERP users never authenticate here.
const express = require("express");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const {
  User,
  Role,
  Permission,
  UserAccessScope,
  Application,
  ApplicationNavigation,
  sequelize,
} = require("../models");
const asyncHandler = require("../middleware/asyncHandler");
const HttpError = require("../errors/HttpError");
const access = require("../services/subscription-access");
const router = express.Router();
async function validateSharedScopes(scopes,license){
 if(process.env.PLATFORM_MASTERS_MODE!=='shared')return;
 for(const scope of scopes){
  if(!license.applications.some(a=>a.code.toUpperCase()===scope.applicationName.toUpperCase()))throw new HttpError(422,'Scope application is outside this subscription');
  const rows=await require('../services/shared-masters').query("SELECT id FROM app_shared_masters WHERE id::text=:id AND module='factories' AND organization_id=:org AND status='Active'",{id:scope.factoryId,org:scope.organizationId});
  if(!rows.length)throw new HttpError(422,'Choose an active factory belonging to the selected company from Platform Masters');
 }
}
router.use((req, res, next) => {
  const expected = process.env.CONTROL_INSTANCE_KEY || "",
    received = (req.get("authorization") || "").replace(/^Bearer /, "");
  if (
    !access.managed() ||
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(received) ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  )
    return next(new HttpError(401, "Invalid instance integration key"));
  res.set("Cache-Control", "no-store");
  next();
});
router.get('/master-options',asyncHandler(async(req,res)=>{const rows=await require('../services/shared-masters').query("SELECT id,name,module,organization_id FROM app_shared_masters WHERE module IN ('organization','factories') AND status='Active' ORDER BY name,id");res.json({organizations:rows.filter(r=>r.module==='organization'),factories:rows.filter(r=>r.module==='factories')});}));
router.get(
  "/catalog",
  asyncHandler(async (req, res) => {
    const [applications, permissions, navigation] = await Promise.all([
      Application.findAll(),
      Permission.findAll(),
      ApplicationNavigation.findAll(),
    ]);
    res.json({
      applications,
      permissions,
      navigation: navigation.map((n) => ({
        applicationName: n.applicationName,
        landingRoute: n.landingRoute,
        navbarItems: JSON.parse(n.navbarItems),
      })),
    });
  }),
);
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page || 1),
      pageSize = Number(req.query.pageSize || 12);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new HttpError(400, "Invalid pagination");
    const search = String(req.query.search || "")
      .slice(0, 180)
      .replace(/[\\%_]/g, "\\$&");
    const { count, rows } = await User.findAndCountAll({
      where: search
        ? {
            [Op.or]: [
              { employeeCode: { [Op.iLike]: `%${search}%` } },
              { employeeName: { [Op.iLike]: `%${search}%` } },
            ],
          }
        : {},
      include: [
        { model: Role, as: "roles", through: { attributes: [] } },
        { model: UserAccessScope, as: "accessScopes", required: false },
      ],
      distinct: true,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [["id", "ASC"]],
    });
    res.json({
      items: rows,
      page,
      pageSize,
      total: count,
      totalPages: Math.ceil(count / pageSize),
    });
  }),
);
router.put(
  "/roles/:name",
  asyncHandler(async (req, res) => {
    const value = await access.license();
    if (!value?.active)
      throw new HttpError(403, "Active subscription required");
    const { permissions } = req.body;
    const name = req.params.name;
    if (
      !name ||
      name.length > 100 ||
      ["superadmin", "admin", "*"].includes(name.toLowerCase()) ||
      !Array.isArray(permissions) ||
      permissions.some((p) => !value.permissions.includes(p))
    )
      throw new HttpError(403, "Invalid role or permission ceiling");
    await sequelize.transaction(async (transaction) => {
      // Namespaced roles never mutate an installation administrator’s existing role.
      const [role, created] = await Role.findOrCreate({
        where: { name: `subscription:${name}` },
        defaults: { enabled: true },
        transaction,
      });
      const previous = (await role.getPermissions({ transaction }))
        .map((p) => p.name)
        .sort();
      const desired = [...new Set(permissions)].sort();
      const changed =
        created ||
        role.enabled !== (req.body.enabled !== false) ||
        JSON.stringify(previous) !== JSON.stringify(desired);
      const permissionRecords = await Promise.all(
        [...new Set(permissions)].map(async (name) => {
          const [permission] = await Permission.findOrCreate({
            where: { name },
            defaults: { enabled: true },
            transaction,
          });
          return permission;
        }),
      );
      await role.setPermissions(permissionRecords, { transaction });
      await role.update(
        { enabled: req.body.enabled !== false },
        { transaction },
      );
      if (changed) {
        const users = await role.getUsers({ attributes: ["id"], transaction });
        if (users.length)
          await User.increment("sessionVersion", {
            by: 1,
            where: { id: users.map((u) => u.id) },
            transaction,
          });
      }
    });
    res.json({ message: "Role synchronized" });
  }),
);
router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const value = await access.license();
    if (!value?.active)
      throw new HttpError(403, "Active subscription required");
    const b = req.body;
    if (
      ![b.username, b.display_name, b.password].every(
        (v) => typeof v === "string" && v.trim(),
      ) ||
      b.username.length > 180 ||
      b.display_name.length > 180 ||
      b.password.length < 12 ||
      Buffer.byteLength(b.password) > 72
    )
      throw new HttpError(
        400,
        "Username, display name and password (12–72 bytes) are required",
      );
    if (
      !Array.isArray(b.roles) ||
      !b.roles.length ||
      b.roles.some((r) => typeof r !== "string")
    )
      throw new HttpError(
        400,
        "Select at least one synchronized customer role",
      );
    const scopes = (b.scopes || []).map(
      require("../services/access-scope.service").normalizeScope,
    );
    if (
      !scopes.length ||
      scopes.some(
        (scope) =>
          !scope.organizationId ||
          !scope.factoryId ||
          scope.applicationName === "*",
      )
    )
      throw new HttpError(
        400,
        "Explicit organization and factory IDs are required for each scope",
      );
    await validateSharedScopes(scopes,value);
    const hash = await bcrypt.hash(b.password, 12);
    await sequelize.transaction(async (transaction) => {
      await sequelize.query("SELECT pg_advisory_xact_lock(70202028)", {
        transaction,
      });
      if (
        (await User.count({ where: { isActive: true }, transaction })) >=
        value.max_users
      )
        throw new HttpError(409, "Subscription user limit reached");
      const roles = await Role.findAll({
        where: { name: b.roles.map((r) => `subscription:${r}`), enabled: true },
        include: [{ model: Permission, as: "permissions" }],
        transaction,
      });
      if (
        roles.length !== new Set(b.roles).size ||
        roles.some((r) =>
          r.permissions.some((p) => !value.permissions.includes(p.name)),
        )
      )
        throw new HttpError(403, "Role exceeds subscription access");
      const user = await User.create(
        {
          employeeCode: b.username.trim(),
          employeeName: b.display_name.trim(),
          authCode: hash,
          isActive: true,
        },
        { transaction },
      );
      await user.setRoles(roles, { transaction });
      await UserAccessScope.bulkCreate(
        scopes.map((scope) => ({ ...scope, userId: user.id })),
        { transaction },
      );
    });
    res.status(201).json({ message: "ERP employee created" });
  }),
);
router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.id) || typeof req.body.enabled !== "boolean")
      throw new HttpError(400, "User ID and enabled status required");
    const value = await access.license();
    if (!value?.active)
      throw new HttpError(403, "Active subscription required");
    await sequelize.transaction(async (transaction) => {
      await sequelize.query("SELECT pg_advisory_xact_lock(70202028)", {
        transaction,
      });
      const user = await User.findByPk(req.params.id, {
        include: [{ model: Role, as: "roles" }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: User },
      });
      if (!user) throw new HttpError(404, "User not found");
      if (
        !user.roles.length ||
        user.roles.some((r) => !r.name.startsWith("subscription:"))
      )
        throw new HttpError(
          403,
          "Existing installation operators require a separate migration; only subscription-managed employees can be changed here",
        );
      if (
        req.body.enabled &&
        !user.isActive &&
        (await User.count({ where: { isActive: true }, transaction })) >=
          value.max_users
      )
        throw new HttpError(409, "Subscription user limit reached");
      await user.update(
        { isActive: req.body.enabled, sessionVersion: user.sessionVersion + 1 },
        { transaction },
      );
    });
    res.json({ message: "ERP employee status updated" });
  }),
);
router.put(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.id))
      throw new HttpError(400, "Invalid ERP user ID");
    const value = await access.license();
    if (!value?.active)
      throw new HttpError(403, "Active subscription required");
    const b = req.body;
    if (
      typeof b.display_name !== "string" ||
      !b.display_name.trim() ||
      b.display_name.length > 180 ||
      !Array.isArray(b.roles) ||
      !b.roles.length ||
      b.roles.some((r) => typeof r !== "string")
    )
      throw new HttpError(400, "Display name and customer roles required");
    if (
      b.password &&
      (typeof b.password !== "string" ||
        b.password.length < 12 ||
        Buffer.byteLength(b.password) > 72)
    )
      throw new HttpError(400, "Password must contain 12–72 bytes");
    if (!Array.isArray(b.scopes))
      throw new HttpError(
        400,
        "Explicit organization and factory scopes required",
      );
    const scopes = b.scopes.map(
      require("../services/access-scope.service").normalizeScope,
    );
    if (
      !scopes.length ||
      scopes.some(
        (scope) =>
          !scope.organizationId ||
          !scope.factoryId ||
          scope.applicationName === "*",
      )
    )
      throw new HttpError(
        400,
        "Explicit organization and factory IDs are required for each scope",
      );
    await validateSharedScopes(scopes,value);
    const passwordHash = b.password ? await bcrypt.hash(b.password, 12) : null;
    await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(req.params.id, {
        include: [{ model: Role, as: "roles" }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: User },
      });
      if (!user) throw new HttpError(404, "User not found");
      if (
        !user.roles.length ||
        user.roles.some((r) => !r.name.startsWith("subscription:"))
      )
        throw new HttpError(
          403,
          "Existing installation operators require a separate migration",
        );
      const roles = await Role.findAll({
        where: { name: b.roles.map((r) => `subscription:${r}`), enabled: true },
        include: [{ model: Permission, as: "permissions" }],
        transaction,
      });
      if (
        roles.length !== new Set(b.roles).size ||
        roles.some((r) =>
          r.permissions.some((p) => !value.permissions.includes(p.name)),
        )
      )
        throw new HttpError(403, "Role exceeds subscription access");
      await user.update(
        {
          employeeName: b.display_name.trim(),
          ...(passwordHash ? { authCode: passwordHash } : {}),
          sessionVersion: user.sessionVersion + 1,
        },
        { transaction },
      );
      await user.setRoles(roles, { transaction });
      await UserAccessScope.destroy({
        where: { userId: user.id },
        transaction,
      });
      await UserAccessScope.bulkCreate(
        scopes.map((scope) => ({ ...scope, userId: user.id })),
        { transaction },
      );
    });
    res.json({
      message: "ERP employee updated. Previous sessions have ended.",
    });
  }),
);
module.exports = router;
router.get(
  "/legacy-preview",
  asyncHandler(async (req, res) =>
    res.json(await require("../services/legacy-adoption").preview()),
  ),
);
router.post(
  "/legacy-adopt",
  asyncHandler(async (req, res) =>
    res.json(
      await require("../services/legacy-adoption").adopt(
        req.body,
        await access.license(),
      ),
    ),
  ),
);
router.post(
  "/legacy-rollback",
  asyncHandler(async (req, res) => {
    if (
      !Array.isArray(req.body.user_ids) ||
      req.body.user_ids.some((id) => !/^\d+$/.test(String(id)))
    )
      throw new HttpError(400, "User IDs required");
    res.json(
      await require("../services/legacy-adoption").rollback(req.body.user_ids),
    );
  }),
);
