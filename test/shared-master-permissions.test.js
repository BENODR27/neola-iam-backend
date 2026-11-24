const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  expandMasterPermissions,
  hierarchyPermissions,
} = require("../src/security/master-permissions");
const { userHasPermission } = require("../src/security/permissions");
test("login projection intersects expanded role bundles with narrow licenses without exposing credentials", () => {
  const { safeUser } = require("../src/services/auth.service");
  const user = {
    subscriptionPermissions: ["MASTERS-FACTORIES-READ"],
    toJSON: () => ({
      authCode: "never-return-this",
      roles: [
        {
          enabled: true,
          permissions: [{ name: "MASTERS-READ", enabled: true }],
        },
      ],
    }),
  };
  const presented = safeUser(user);
  assert.equal(presented.authCode, undefined);
  assert.deepEqual(
    presented.roles[0].permissions.map((p) => p.name),
    ["MASTERS-FACTORIES-READ"],
  );
  user.toJSON = () => ({
    roles: [
      {
        enabled: false,
        permissions: [{ name: "MASTERS-READ", enabled: true }],
      },
    ],
  });
  assert.deepEqual(safeUser(user).roles[0].permissions, []);
});
test("hierarchy bundles expand downward while page grants never grant another page or broad access", () => {
  const read = expandMasterPermissions(["MASTERS-READ"]);
  for (const prefix of Object.values(hierarchyPermissions))
    assert.ok(read.includes(prefix + "-READ"));
  assert.ok(!read.includes("MASTERS-DEPARTMENTS-MANAGE"));
  assert.ok(
    !expandMasterPermissions(["MASTERS-MANAGE"]).includes(
      "MASTERS-COMPANIES-MANAGE",
    ),
  );
  assert.ok(
    expandMasterPermissions(["MASTERS-ADMIN"]).includes(
      "MASTERS-COMPANIES-MANAGE",
    ),
  );
  const user = {
    roles: [
      {
        enabled: true,
        permissions: [{ enabled: true, name: "MASTERS-DEPARTMENTS-READ" }],
      },
    ],
  };
  assert.ok(userHasPermission(user, "MASTERS-DEPARTMENTS-READ"));
  assert.ok(!userHasPermission(user, "MASTERS-FACTORIES-READ"));
  assert.ok(!userHasPermission(user, "MASTERS-READ"));
  assert.ok(
    !userHasPermission(
      { ...user, roles: [{ ...user.roles[0], enabled: false }] },
      "MASTERS-DEPARTMENTS-READ",
    ),
  );
  assert.ok(
    !userHasPermission(
      { ...user, subscriptionPermissions: [] },
      "MASTERS-DEPARTMENTS-READ",
    ),
  );
});
