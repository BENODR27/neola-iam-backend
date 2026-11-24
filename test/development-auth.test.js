const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { User } = require("../src/models");
const authenticate = require("../src/middleware/authenticate");
const { issueToken } = require("../src/services/auth.service");

test("development requires signed sessions and rejects automatic wildcard bypass", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    ALLOW_DEV_AUTH_BYPASS: process.env.ALLOW_DEV_AUTH_BYPASS,
  };
  Object.assign(process.env, {
    NODE_ENV: "development",
    JWT_SECRET: "development-auth-test-only",
    ALLOW_DEV_AUTH_BYPASS: "true",
  });
  try {
    for (const header of [
      "",
      "Bearer development",
      "Bearer development:42:3:1234567890",
    ]) {
      let received;
      await authenticate({ get: () => header }, {}, (error) => {
        received = error;
      });
      assert.equal(received.status, 401);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("development JWTs retain only enabled IAM permissions and preserve user identity", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  const originalFindOne = User.findOne;
  Object.assign(process.env, {
    NODE_ENV: "development",
    JWT_SECRET: "development-auth-test-only",
  });
  const user = {
    id: 42,
    employeeCode: "E1001",
    isActive: true,
    sessionVersion: 3,
    roles: [
      {
        enabled: true,
        permissions: [
          { enabled: true, name: "MMMS-APP" },
          { enabled: false, name: "*" },
        ],
      },
      {
        enabled: false,
        permissions: [{ enabled: true, name: "users:manage" }],
      },
    ],
  };
  User.findOne = async () => user;
  try {
    const token = issueToken(user);
    assert.equal(token.split(".").length, 3);
    assert.deepEqual(jwt.decode(token).permissions, ["MMMS-APP"]);
    const req = { get: () => "Bearer " + token };
    let received;
    await authenticate(req, {}, (error) => {
      received = error;
    });
    assert.equal(received, undefined);
    assert.equal(req.user.id, 42);
    assert.equal(req.user.roles, user.roles);
    assert.equal(req.authClaims.sessionVersion, 3);
    assert.ok(Number.isSafeInteger(req.authClaims.iat));
  } finally {
    User.findOne = originalFindOne;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
