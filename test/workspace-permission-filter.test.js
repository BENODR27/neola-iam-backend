const test = require("node:test");
const assert = require("node:assert/strict");
const { Application, ApplicationNavigation } = require("../src/models");
const { listWorkspace } = require("../src/services/application.service");
test("workspace filters application access and navigation using enabled IAM permissions only", async () => {
  const oldApps = Application.findAll,
    oldNavigation = ApplicationNavigation.findAll;
  Application.findAll = async () => [
    { applicationName: "MMMS", requiredPermission: "MMMS-APP" },
  ];
  ApplicationNavigation.findAll = async () => [
    {
      toJSON: () => ({
        applicationName: "MMMS",
        landingRoute: "/mmms",
        navbarItems: JSON.stringify([
          {
            label: "Factory assets",
            link: "/mmms/machines",
            permission: "MMMS-MACHINES",
          },
          { label: "Costs", link: "/mmms/costs", permission: "MMMS-COSTS" },
        ]),
      }),
    },
  ];
  const request = (permissions) => ({
    user: {
      roles: [
        {
          enabled: true,
          permissions: permissions.map((name) => ({ name, enabled: true })),
        },
      ],
    },
  });
  try {
    const noApp = await listWorkspace(request(["MMMS-MACHINES"]));
    assert.deepEqual(noApp.applications, []);
    assert.deepEqual(noApp.navigation[0].navbarItems, []);
    assert.equal(noApp.navigation[0].landingRoute, null);
    const machineOnly = await listWorkspace(
      request(["MMMS-APP", "MMMS-MACHINES"]),
    );
    assert.equal(machineOnly.navigation[0].navbarItems.length, 1);
    assert.equal(
      machineOnly.navigation[0].navbarItems[0].label,
      "Factory assets",
    );
    assert.equal(
      (await listWorkspace(request(["*"]))).navigation[0].navbarItems.length,
      2,
    );
    const disabled = request(["*"]);
    disabled.user.roles[0].enabled = false;
    assert.deepEqual((await listWorkspace(disabled)).applications, []);
  } finally {
    Application.findAll = oldApps;
    ApplicationNavigation.findAll = oldNavigation;
  }
});

test("subscription workspace retains only permitted database-owned IAM navigation", async () => {
  const oldApps = Application.findAll,
    oldNavigation = ApplicationNavigation.findAll;
  const app = { applicationName: "IAM", requiredPermission: "IAM-APP" };
  Application.findAll = async () => [app];
  ApplicationNavigation.findAll = async () => [
    {
      applicationName: "IAM",
      landingRoute: "/adminv2/user",
      navbarItems: JSON.stringify([
        { label: "Users", link: "/adminv2/user", permission: "users:manage" },
        { label: "Roles", link: "/adminv2/role", permission: "roles:manage" },
      ]),
    },
  ];
  const req = (permissions) => ({
    user: {
      subscriptionPermissions: permissions,
      subscriptionLicense: { applications: [] },
    },
  });
  try {
    assert.deepEqual((await listWorkspace(req(["MMMS-APP"]))).applications, []);
    assert.deepEqual((await listWorkspace(req(["IAM-APP"]))).applications, []);
    const result = await listWorkspace(req(["IAM-APP", "roles:manage"]));
    assert.equal(result.applications[0].applicationName, "IAM");
    assert.equal(result.navigation[0].landingRoute, "/adminv2/role");
    assert.equal(result.navigation[0].navbarItems.length, 1);
  } finally {
    Application.findAll = oldApps;
    ApplicationNavigation.findAll = oldNavigation;
  }
});
