"use strict";

const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const {
  navigation,
  applicationIcon,
} = require("../src/config/mmms-navigation");
const {
  names: actionNames,
} = require("../seeders/20261117000100-register-mmms-workflow-actions");

// Also used by native CLI runs; match Compose's literal/raw seed-file values.
function seedEnvironment(env = process.env) {
  const values = { ...env };
  const file = path.resolve(".env.seed");
  if (fs.existsSync(file))
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match =
        /^(SUPERADMIN_EMPLOYEE_CODE|SUPERADMIN_PASSWORD|SUPERADMIN_NAME)=(.*)$/.exec(
          line,
        );
      if (match && values[match[1]] === undefined) values[match[1]] = match[2];
    }
  return values;
}

async function seedBase(
  models,
  env = process.env,
  { configsOnly = false } = {},
) {
  const {
    sequelize,
    User,
    Role,
    Permission,
    Application,
    ApplicationNavigation,
  } = models;
  return sequelize.transaction(async (transaction) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(70102026)", {
      transaction,
    });
    const options = { transaction };
    const code = String(env.SUPERADMIN_EMPLOYEE_CODE || "").trim();
    if (!configsOnly && (!code || code.length > 255))
      throw Error("Configure SUPERADMIN_EMPLOYEE_CODE in .env.seed");
    const existing = configsOnly
      ? null
      : await User.findOne({ where: { employeeCode: code }, ...options });
    const count = configsOnly ? 0 : await User.count(options);
    if (!configsOnly && !existing && count)
      throw Error(
        "IAM already has users; refusing to create another bootstrap administrator",
      );
    if (
      !configsOnly &&
      !existing &&
      (typeof env.SUPERADMIN_PASSWORD !== "string" ||
        env.SUPERADMIN_PASSWORD.length < 12 ||
        Buffer.byteLength(env.SUPERADMIN_PASSWORD) > 72)
    )
      throw Error(
        "A new administrator requires SUPERADMIN_PASSWORD with 12–72 bytes",
      );

    // Migrations own IAM/Masters defaults. MMMS uses the existing domain catalog.
    const items =
      env.PLATFORM_MASTERS_MODE === "shared"
        ? navigation.filter(
            (item) =>
              ![
                "/mmms/organization",
                "/mmms/factories",
                "/mmms/departments",
                "/mmms/production-lines",
              ].includes(item.link),
          )
        : navigation;
    for (const name of new Set([
      "MMMS-APP",
      ...items.map((item) => item.permission),
      ...actionNames,
    ]))
      await Permission.findOrCreate({
        where: { name },
        defaults: { appname: "MMMS", enabled: true },
        ...options,
      });
    await Application.findOrCreate({
      where: { applicationName: "MMMS" },
      defaults: { applicationIcon, requiredPermission: "MMMS-APP" },
      ...options,
    });
    await ApplicationNavigation.findOrCreate({
      where: { applicationName: "MMMS" },
      defaults: { landingRoute: "/mmms", navbarItems: JSON.stringify(items) },
      ...options,
    });

    if (configsOnly || existing)
      return {
        administrator: configsOnly ? "not-requested" : "preserved",
        configurations: "registered",
      };
    const [permission] = await Permission.findOrCreate({
      where: { name: "*" },
      defaults: { appname: "IAM", enabled: true },
      ...options,
    });
    const [role, roleCreated] = await Role.findOrCreate({
      where: { name: "ADMIN" },
      defaults: { enabled: true },
      ...options,
    });
    if (!permission.enabled || !role.enabled)
      throw Error(
        "Bootstrap ADMIN role or wildcard permission is disabled; existing settings were preserved",
      );
    if (!roleCreated && !(await role.hasPermission(permission, options)))
      throw Error(
        "Existing ADMIN grants are customized; refusing to add bootstrap privileges",
      );
    if (roleCreated) await role.addPermission(permission, options);
    const user = await User.create(
      {
        employeeCode: code,
        employeeName: env.SUPERADMIN_NAME || "NeoLA Administrator",
        authCode: await bcrypt.hash(env.SUPERADMIN_PASSWORD, 12),
        isActive: true,
      },
      options,
    );
    await user.addRole(role, options);
    return { administrator: "created", configurations: "registered" };
  });
}

if (require.main === module) {
  const seedValues = seedEnvironment();
  require("dotenv").config();
  const env = { ...process.env, ...seedValues };
  const models = require("../src/models");
  seedBase(models, env, {
    configsOnly: process.argv.includes("--configs-only"),
  })
    .then((result) => console.log("Base IAM seed:", JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => models.sequelize.close());
}

module.exports = { seedBase, seedEnvironment };
