const crypto = require("node:crypto");
const {
  User,
  Role,
  Permission,
  UserAccessScope,
  sequelize,
} = require("../models");
const { QueryTypes } = require("sequelize");
const HttpError = require("../errors/HttpError");
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
async function preview(transaction) {
  const users = await User.findAll({
    include: includes,
    order: [["id", "ASC"]],
    transaction,
  });
  const adopted = await sequelize.query(
    "SELECT user_id FROM app_control_adoptions WHERE rolled_back_at IS NULL",
    { type: QueryTypes.SELECT, transaction },
  );
  const items = users.map((u) => ({
    id: String(u.id),
    username: u.employeeCode,
    display_name: u.employeeName,
    enabled: u.isActive,
    sessionVersion: u.sessionVersion,
    roles: u.roles
      .map((r) => ({
        id: String(r.id),
        name: r.name,
        enabled: r.enabled,
        permissions: r.permissions
          .filter((p) => p.enabled)
          .map((p) => p.name)
          .sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    scopes: u.accessScopes
      .map((s) => s.toJSON())
      .sort((a, b) => Number(a.id) - Number(b.id)),
    adopted: adopted.some((a) => String(a.user_id) === String(u.id)),
  }));
  return {
    items,
    source_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(items))
      .digest("hex"),
  };
}
async function adopt(body, license) {
  if (!license?.active)
    throw new HttpError(403, "Active subscription required");
  return sequelize.transaction(async (transaction) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(70202028)", {
      transaction,
    });
    const source = await preview(transaction);
    if (source.source_hash !== body.source_hash)
      throw new HttpError(
        409,
        "IAM records changed. Review a fresh migration preview.",
      );
    const selected = body.user_ids;
    if (!Array.isArray(selected) || !selected.length)
      throw new HttpError(400, "Select legacy user IDs");
    const masters = await sequelize.query(
      "SELECT id,organization_id FROM app_shared_masters WHERE module='factories' AND status='Active' AND organization_id IS NOT NULL",
      { type: QueryTypes.SELECT, transaction },
    );
    let migrated = 0;
    for (const id of [...new Set(selected.map(String))]) {
      const original = source.items.find((u) => u.id === id);
      if (!original) throw new HttpError(404, "Legacy user not found");
      if (original.adopted) continue;
      const granted = new Set(
        original.roles.filter((r) => r.enabled).flatMap((r) => r.permissions),
      );
      const permissions = license.permissions.filter(
        (p) => granted.has("*") || granted.has(p),
      );
      const [role] = await Role.findOrCreate({
        where: { name: `subscription:Legacy user ${id}` },
        defaults: { enabled: true },
        transaction,
      });
      const records = [];
      for (const name of permissions) {
        const [p] = await Permission.findOrCreate({
          where: { name },
          defaults: { enabled: true },
          transaction,
        });
        records.push(p);
      }
      await role.setPermissions(records, { transaction });
      const user = await User.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      await sequelize.query(
        `INSERT INTO app_control_adoptions(user_id,source_hash,original_roles,original_scopes,adopted_roles) VALUES(:id,:hash,CAST(:roles AS jsonb),CAST(:scopes AS jsonb),CAST(:adopted AS jsonb)) ON CONFLICT(user_id) DO UPDATE SET source_hash=excluded.source_hash,adopted_roles=excluded.adopted_roles,rolled_back_at=null`,
        {
          replacements: {
            id,
            hash: source.source_hash,
            roles: JSON.stringify(original.roles),
            scopes: JSON.stringify(original.scopes),
            adopted: JSON.stringify([String(role.id)]),
          },
          transaction,
        },
      );
      await user.setRoles([role], { transaction });
      if (
        granted.has("*") ||
        require("./iam-access.service").localPermissions.every((p) =>
          granted.has(p),
        )
      ) {
        const administrator = await Role.findOne({
          where: { name: "IAM Identity Administrator", enabled: true },
          transaction,
        });
        if (administrator) await user.addRole(administrator, { transaction });
      }
      if (granted.has("*"))
        for (const master of masters) {
          const exists = await UserAccessScope.findOne({
            where: {
              userId: id,
              applicationName: "MMMS",
              organizationId: master.organization_id,
              factoryId: master.id,
            },
            transaction,
          });
          if (!exists)
            await UserAccessScope.create(
              {
                userId: id,
                applicationName: "MMMS",
                organizationId: master.organization_id,
                factoryId: master.id,
                enabled: true,
              },
              { transaction },
            );
        }
      await user.increment("sessionVersion", { by: 1, transaction });
      migrated++;
    }
    return {
      message: `${migrated} legacy accounts migrated; credentials, IDs, original roles and scope snapshots preserved`,
      migrated,
    };
  });
}
async function rollback(ids) {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(70202028)", {
      transaction,
    });
    for (const id of ids) {
      const [snapshot] = await sequelize.query(
        "SELECT * FROM app_control_adoptions WHERE user_id=:id FOR UPDATE",
        { replacements: { id }, type: QueryTypes.SELECT, transaction },
      );
      if (!snapshot || snapshot.rolled_back_at) continue;
      const user = await User.findByPk(id, { transaction });
      await user.setRoles(
        snapshot.original_roles.map((r) => r.id),
        { transaction },
      );
      await UserAccessScope.destroy({ where: { userId: id }, transaction });
      for (const scope of snapshot.original_scopes) {
        await UserAccessScope.create(scope, { transaction });
      }
      await user.increment("sessionVersion", { by: 1, transaction });
      await sequelize.query(
        "UPDATE app_control_adoptions SET rolled_back_at=now() WHERE user_id=:id",
        { replacements: { id }, transaction },
      );
    }
    return {
      message:
        "Original assignments restored. Subscription ceilings still apply while subscription mode is enabled.",
    };
  });
}
module.exports = { preview, adopt, rollback };
