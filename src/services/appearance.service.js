const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
const {
  sequelize,
  User,
  BrandingAccount,
  UserAppearance,
} = require("../models");
const HttpError = require("../errors/HttpError");
const { defaultTheme, validateTheme } = require("./appearance-validation");
const platformCode = "__PLATFORM__";
async function effective(userId) {
  const preference = await UserAppearance.findByPk(userId);
  const account = preference?.accountId
    ? await BrandingAccount.findByPk(preference.accountId)
    : null;
  const platform = account
    ? null
    : await BrandingAccount.findOne({ where: { code: platformCode } });
  return {
    account: account
      ? { id: account.id, name: account.name, revision: account.revision }
      : null,
    theme: account?.theme || platform?.theme || defaultTheme,
    mode: preference?.mode || "inherit",
  };
}
async function setMode(userId, mode) {
  if (!["inherit", "light", "dark", "system"].includes(mode))
    throw new HttpError(422, "Choose account default, light, dark or system");
  await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new HttpError(404, "User not found");
    const current = await UserAppearance.findByPk(userId, { transaction });
    if (current)
      await current.update({ mode, updatedAt: new Date() }, { transaction });
    else
      await UserAppearance.create(
        { userId, mode, updatedAt: new Date() },
        { transaction },
      );
  });
  return effective(userId);
}
async function management() {
  const [accounts, users, preferences] = await Promise.all([
    BrandingAccount.findAll({ order: [["name", "ASC"]] }),
    User.findAll({
      attributes: ["id", "employeeCode", "employeeName"],
      order: [["employeeName", "ASC"]],
    }),
    UserAppearance.findAll(),
  ]);
  return {
    accounts: accounts.filter((row) => row.code !== platformCode),
    platform: accounts.find((row) => row.code === platformCode) || {
      id: "platform",
      code: platformCode,
      name: "Platform default",
      theme: defaultTheme,
      revision: 0,
    },
    users: users.map((user) => ({
      ...user.toJSON(),
      accountId:
        preferences.find((row) => String(row.userId) === String(user.id))
          ?.accountId || null,
    })),
  };
}
async function saveAccount(id, body, actor) {
  const theme = validateTheme(body.theme);
  const name = String(body.name || "").trim();
  const code =
    id === "platform"
      ? platformCode
      : String(body.code || "")
          .trim()
          .toUpperCase();
  if (
    !name ||
    name.length > 180 ||
    !code ||
    code.length > 80 ||
    (id !== "platform" && !/^[A-Z0-9][A-Z0-9_-]*$/.test(code))
  )
    throw new HttpError(
      422,
      "Provide an account name and a unique code containing letters, numbers, hyphens or underscores",
    );
  return sequelize.transaction(async (transaction) => {
    if (id === "platform")
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:key))", {
        replacements: { key: "appearance-platform" },
        transaction,
      });
    const current =
      id === "platform"
        ? await BrandingAccount.findOne({
            where: { code: platformCode },
            transaction,
            lock: transaction.LOCK.UPDATE,
          })
        : id
          ? await BrandingAccount.findByPk(id, {
              transaction,
              lock: transaction.LOCK.UPDATE,
            })
          : null;
    if (id && id !== "platform" && !current)
      throw new HttpError(404, "Branding account not found");
    if (current && Number(body.revision) !== current.revision)
      throw new HttpError(
        409,
        "This theme changed. Reload it before saving your changes",
      );
    const values = {
      name,
      code: current?.code || code,
      theme,
      revision: (current?.revision || 0) + 1,
      changes: [
        ...(current?.changes || []),
        {
          by: actor,
          at: new Date().toISOString(),
          action: current ? "Theme updated" : "Account created",
          previousTheme: current?.theme || null,
        },
      ],
    };
    return current
      ? current.update(values, { transaction })
      : BrandingAccount.create(
          { id: randomUUID(), ...values },
          { transaction },
        );
  });
}
async function saveMembers(accountId, userIds, actor) {
  if (
    !Array.isArray(userIds) ||
    userIds.length > 10000 ||
    !userIds.every((id) => /^\d+$/.test(String(id))) ||
    new Set(userIds.map(String)).size !== userIds.length
  )
    throw new HttpError(422, "Choose a unique list of existing users");
  return sequelize.transaction(async (transaction) => {
    const account = await BrandingAccount.findByPk(accountId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!account || account.code === platformCode)
      throw new HttpError(404, "Vendor branding account not found");
    const current = await UserAppearance.findAll({
      where: { accountId },
      transaction,
    });
    const ids = [
      ...new Set([
        ...userIds.map(String),
        ...current.map((row) => String(row.userId)),
      ]),
    ];
    const users = await User.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ["id"],
      order: [["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      userIds.some(
        (id) => !users.some((user) => String(user.id) === String(id)),
      )
    )
      throw new HttpError(422, "One or more selected users no longer exist");
    for (const user of users) {
      const preference = await UserAppearance.findByPk(user.id, {
        transaction,
      });
      const selected = userIds.map(String).includes(String(user.id));
      if (selected) {
        if (preference)
          await preference.update(
            { accountId, updatedAt: new Date() },
            { transaction },
          );
        else
          await UserAppearance.create(
            {
              userId: user.id,
              accountId,
              mode: "inherit",
              updatedAt: new Date(),
            },
            { transaction },
          );
      } else if (preference?.accountId === accountId)
        await preference.update(
          { accountId: null, updatedAt: new Date() },
          { transaction },
        );
    }
    await account.update(
      {
        changes: [
          ...account.changes,
          {
            by: actor,
            at: new Date().toISOString(),
            action: "Branding membership updated",
            userIds: userIds.map(String),
          },
        ],
      },
      { transaction },
    );
    return { accountId, userIds: userIds.map(String) };
  });
}
module.exports = { effective, setMode, management, saveAccount, saveMembers };
