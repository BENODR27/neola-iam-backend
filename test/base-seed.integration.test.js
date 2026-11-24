const { test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { seedBase } = require("../scripts/seed-base");

test(
  "base IAM seed is atomic and preserves credentials, grants and customized configuration",
  {
    skip: process.env.BASE_SEED_INTEGRATION_TEST !== "true",
  },
  async () => {
    assert.equal(process.env.DB_HOST, "127.0.0.1");
    assert.match(process.env.DB_NAME, /^neola_seed_iam_\d+_test$/);
    const models = require("../src/models");
    const { User, Role, Permission, ApplicationNavigation, sequelize } = models;
    const env = {
      SUPERADMIN_EMPLOYEE_CODE: "seed.admin",
      SUPERADMIN_NAME: "Seed Administrator",
      SUPERADMIN_PASSWORD: "Seed-test-password-2026!",
      PLATFORM_MASTERS_MODE: "shared",
    };
    try {
      assert.equal(await User.count(), 0);
      await assert.rejects(
        seedBase(models, { ...env, SUPERADMIN_PASSWORD: "short" }),
        /12–72/,
      );
      assert.equal(await User.count(), 0);
      assert.equal(
        await ApplicationNavigation.count({
          where: { applicationName: "MMMS" },
        }),
        0,
      );
      const adminRole = await Role.create({ name: "ADMIN", enabled: true });
      await assert.rejects(seedBase(models, env), /grants are customized/);
      assert.equal(await User.count(), 0);
      assert.equal(
        await ApplicationNavigation.count({
          where: { applicationName: "MMMS" },
        }),
        0,
      );
      const wildcard = await Permission.create({
        name: "*",
        appname: "IAM",
        enabled: true,
      });
      await adminRole.addPermission(wildcard);
      const parallel = await Promise.all([
        seedBase(models, env),
        seedBase(models, env),
      ]);
      assert.deepEqual(parallel.map((result) => result.administrator).sort(), [
        "created",
        "preserved",
      ]);
      const user = await User.unscoped().findOne({
        where: { employeeCode: env.SUPERADMIN_EMPLOYEE_CODE },
      });
      assert(await bcrypt.compare(env.SUPERADMIN_PASSWORD, user.authCode));
      const originalHash = user.authCode;
      assert.equal((await user.getRoles())[0].name, "ADMIN");
      assert(
        await Permission.findOne({
          where: { name: "MMMS-WORK-ORDERS-APPROVE" },
        }),
      );
      const navigation = await ApplicationNavigation.findByPk("MMMS");
      assert(
        !JSON.parse(navigation.navbarItems).some(
          (item) => item.link === "/mmms/organization",
        ),
      );

      const customItems = JSON.stringify([
        {
          label: "My machines",
          link: "/mmms/machines",
          icon: "bi-cpu",
          permission: "MMMS-MACHINES",
        },
      ]);
      await navigation.update({ navbarItems: customItems });
      const role = await Role.create({
        name: "Custom limited role",
        enabled: true,
      });
      await user.setRoles([role]);
      await user.update({ isActive: false });
      const permission = await Permission.findOne({
        where: { name: "MMMS-WORK-ORDERS-APPROVE" },
      });
      await permission.update({ enabled: false });
      assert.equal(
        (
          await seedBase(models, {
            ...env,
            SUPERADMIN_PASSWORD: "A-different-password-2026!",
          })
        ).administrator,
        "preserved",
      );
      await user.reload();
      assert.equal(user.authCode, originalHash);
      assert.equal(user.isActive, false);
      assert.deepEqual(
        (await user.getRoles()).map((r) => r.name),
        ["Custom limited role"],
      );
      assert.equal((await permission.reload()).enabled, false);
      assert.equal((await navigation.reload()).navbarItems, customItems);
      assert.equal(await User.count(), 1);
      await assert.rejects(
        seedBase(models, { ...env, SUPERADMIN_EMPLOYEE_CODE: "another.admin" }),
        /already has users/,
      );
      assert.equal(await User.count(), 1);
      await seedBase(models, {}, { configsOnly: true });
      assert.equal((await user.reload()).authCode, originalHash);
    } finally {
      await sequelize.close();
    }
  },
);
