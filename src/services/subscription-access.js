const HttpError = require("../errors/HttpError");
const { expandMasterPermissions } = require("../security/master-permissions");
const managed = () => process.env.CONTROL_PLANE_MODE === "subscription";
let cached,
  expires = 0,
  pending;
function resetCache() {
  cached = undefined;
  expires = 0;
  pending = undefined;
}
async function license() {
  if (!managed()) return null;
  if (cached && Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    const origin = process.env.CONTROL_API_URL;
    const instance = process.env.CONTROL_INSTANCE_ID;
    const key = process.env.CONTROL_INSTANCE_KEY;
    if (!origin || !instance || !key)
      throw new HttpError(503, "Subscription integration is not configured");
    let response;
    try {
      response = await fetch(
        `${origin.replace(/\/$/, "")}/api/control/internal/instances/${encodeURIComponent(instance)}/entitlements`,
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        },
      );
    } catch {
      throw new HttpError(503, "Subscription service unavailable");
    }
    if (!response.ok)
      throw new HttpError(503, "Subscription service rejected this instance");
    let verified;
    try {
      verified = require("./license-verification").verifyLicense(
        await response.json(),
        instance,
      );
    } catch {
      throw new HttpError(
        503,
        "Provider license signature or lease was rejected",
      );
    }
    const value = verified.value;
    if (
      !Array.isArray(value.permissions) ||
      !Array.isArray(value.applications) ||
      typeof value.active !== "boolean"
    )
      throw new HttpError(503, "Invalid subscription response");
    // Expand only verified commercial bundles; never trust unsigned response fields.
    value.permissions = expandMasterPermissions(value.permissions);
    cached = value;
    expires = Math.min(
      Date.now() + 15000,
      verified.expiresAt,
      value.expires_at
        ? new Date(value.expires_at).getTime()
        : Date.now() + 15000,
    );
    return value;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
function grants(user) {
  return expandMasterPermissions([
    ...new Set(
      (user.roles || [])
        .filter((r) => r.enabled)
        .flatMap((r) =>
          (r.permissions || []).filter((p) => p.enabled).map((p) => p.name),
        ),
    ),
  ]);
}
async function apply(user) {
  const value = await license();
  if (!value) return;
  if (!value.active)
    throw new HttpError(
      403,
      "This ERP subscription is inactive or expired. Contact your customer owner.",
    );
  if (
    !Number.isSafeInteger(value.max_users) ||
    value.max_users < 1 ||
    (await require("../models").User.count({ where: { isActive: true } })) >
      value.max_users
  )
    throw new HttpError(
      403,
      "This installation exceeds its subscribed active-user limit. Contact your customer owner to disable excess accounts or upgrade.",
    );
  const existing = grants(user);
  user.subscriptionPermissions = value.permissions.filter(
    (p) => existing.includes("*") || existing.includes(p),
  );
  user.subscriptionPermissions.push(
    ...require("./iam-access.service").localPermissions.filter(
      (p) => existing.includes("*") || existing.includes(p),
    ),
  );
  user.subscriptionLicense = value;
}
function management(req, res, next) {
  if (!managed()) return next();
  const path = req.path.toLowerCase().replace(/\/$/, "");
  if (
    /^\/(roles|permissions|applications)(\/|$)/.test(path) &&
    path !== "/applications/workspace"
  )
    return next(
      new HttpError(
        409,
        "Manage applications, navigation, roles and permissions in the NeoLA Subscription Console",
      ),
    );
  if (/^\/users(?:\/register|$|\/\d+(?:\/|$))/.test(path))
    return next(
      new HttpError(
        409,
        "Manage ERP employee access in the NeoLA Subscription Console",
      ),
    );
  next();
}
module.exports = { managed, license, apply, grants, management, resetCache };
