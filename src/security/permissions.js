function userHasPermission(user, permissionName) {
  const { expandMasterPermissions } = require("./master-permissions");
  if (user?.subscriptionPermissions)
    return expandMasterPermissions(user.subscriptionPermissions).includes(
      permissionName,
    );
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some(
    (role) =>
      role.enabled &&
      Array.isArray(role.permissions) &&
      (role.permissions.some(
        (permission) => permission.enabled && permission.name === "*",
      ) ||
        expandMasterPermissions(
          role.permissions.filter((p) => p.enabled).map((p) => p.name),
        ).includes(permissionName)),
  );
}

module.exports = { userHasPermission };
