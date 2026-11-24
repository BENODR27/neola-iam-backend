const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, Role, Permission, UserAccessScope } = require("../models");
const HttpError = require("../errors/HttpError");
const { notifyPresenceChanged } = require("./presence-events");

const userIncludes = [
  {
    model: Role,
    as: "roles",
    through: { attributes: [] },
    include: [
      { model: Permission, as: "permissions", through: { attributes: [] } },
    ],
  },
  {
    model: UserAccessScope,
    as: "accessScopes",
    where: { enabled: true },
    required: false,
  },
];

function safeUser(user) {
  const result = user.toJSON();
  delete result.authCode;
  result.roles = (result.roles || []).map((role) => {
    const names = role.enabled
      ? (role.permissions || []).filter((p) => p.enabled).map((p) => p.name)
      : [];
    const expanded =
      names.includes("*") && user.subscriptionPermissions
        ? user.subscriptionPermissions
        : require("../security/master-permissions").expandMasterPermissions(
            names,
          );
    return {
      ...role,
      permissions: expanded
        .filter(
          (name) =>
            !user.subscriptionPermissions ||
            user.subscriptionPermissions.includes(name),
        )
        .map(
          (name) =>
            (role.permissions || []).find(
              (p) => p.name === name && p.enabled,
            ) || { name, enabled: true },
        ),
    };
  });
  return result;
}

function issueToken(user) {
  const permissions = [
    ...new Set(
      (user.roles || [])
        .filter((role) => role.enabled)
        .flatMap((role) =>
          (role.permissions || [])
            .filter((permission) => permission.enabled)
            .map((permission) => permission.name),
        ),
    ),
  ];
  return jwt.sign(
    {
      sub: user.employeeCode,
      sessionVersion: user.sessionVersion ?? 0,
      permissions:
        require("../security/master-permissions").expandMasterPermissions(
          user.subscriptionPermissions || permissions,
        ),
      accessScopes: (user.accessScopes || []).map((scope) =>
        scope.toJSON ? scope.toJSON() : scope,
      ),
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: process.env.JWT_ISSUER || "platform-iam",
      audience: process.env.JWT_AUDIENCE || "platform-applications",
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    },
  );
}

async function authenticate(employeeCode, authCode) {
  if (
    typeof employeeCode !== "string" ||
    typeof authCode !== "string" ||
    !employeeCode ||
    !authCode
  ) {
    throw new HttpError(400, "employeeCode and authCode are required");
  }
  const user = await User.unscoped().findOne({
    where: { employeeCode },
    include: userIncludes,
  });
  if (!user) throw new HttpError(401, "Invalid employeeCode or authCode");
  const encoded = user.authCode.startsWith("$2");
  const valid = encoded
    ? await bcrypt.compare(authCode, user.authCode)
    : authCode === user.authCode;
  if (!valid) throw new HttpError(401, "Invalid employeeCode or authCode");
  if (!user.isActive) throw new HttpError(403, "User account is disabled");
  await require("./subscription-access").apply(user);

  if (!encoded) {
    user.authCode = await bcrypt.hash(authCode, 12);
  }
  const loginTime = new Date();
  user.lastLoginAt = loginTime;
  user.lastActivityAt = loginTime;
  await user.save();
  notifyPresenceChanged();
  return { user: safeUser(user), token: issueToken(user) };
}

module.exports = { authenticate, issueToken, safeUser };
