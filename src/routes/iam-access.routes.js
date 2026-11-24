const { Router } = require("express");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const authorizeAny = require("../middleware/authorize-any");
const asyncHandler = require("../middleware/asyncHandler");
const access = require("../services/iam-access.service");
const { safeUser } = require("../services/auth.service");
const router = Router();
router.param("id", (req, res, next, id) =>
  /^\d{1,19}$/.test(id)
    ? next()
    : next(
        new (require("../errors/HttpError"))(400, "Invalid identity record ID"),
      ),
);
const action = (fn) =>
  asyncHandler(async (req, res) => {
    const result = await fn(req);
    if (req.method !== "GET")
      require("../services/presence-events").notifyPresenceChanged();
    res.json({ status: 200, result });
  });
router.get(
  "/users/access-options",
  authenticate,
  authorize("access-scopes:manage"),
  action(async (req) => {
    const rows = await require("../services/shared-masters").query(
      "SELECT id,name,module,organization_id,data FROM app_shared_masters WHERE module IN ('organization','factories') AND status='Active' ORDER BY name,id",
    );
    return {
      applications: req.user.subscriptionLicense.applications.map(
        (a) => a.code,
      ),
      organizations: rows.filter(
        (r) =>
          r.module === "organization" &&
          (!r.data.unitType || r.data.unitType === "Company"),
      ),
      factories: rows.filter(
        (r) => r.module === "factories" && r.organization_id,
      ),
    };
  }),
);
router.get(
  "/users",
  authenticate,
  authorize("users:manage"),
  action(async () => (await access.users()).map(safeUser)),
);
router.post(
  "/users",
  authenticate,
  authorize("users:manage"),
  action(async (req) => safeUser(await access.saveUser(req))),
);
router.put(
  "/users/:id",
  authenticate,
  authorize("users:manage"),
  action(async (req) => safeUser(await access.saveUser(req, req.params.id))),
);
router.patch(
  "/users/:id/status",
  authenticate,
  authorize("users:manage"),
  action((req) =>
    access.userStatus(
      req,
      req.params.id,
      req.query.enable === "true"
        ? true
        : req.query.enable === "false"
          ? false
          : undefined,
    ),
  ),
);
router.delete(
  "/users/:id",
  authenticate,
  authorize("users:manage"),
  action((req) => access.userStatus(req, req.params.id, false)),
);
router.get(
  "/users/:id/scopes",
  authenticate,
  authorize("access-scopes:manage"),
  action((req) =>
    require("../services/access-scope.service").list(req.params.id),
  ),
);
router.put(
  "/users/:id/scopes",
  authenticate,
  authorize("access-scopes:manage"),
  action((req) => access.scopes(req, req.params.id, req.body.scopes)),
);
router.get(
  "/roles",
  authenticate,
  authorizeAny(["roles:manage", "users:manage"]),
  action((req) => access.roles(req)),
);
router.post(
  "/roles",
  authenticate,
  authorize("roles:manage"),
  action((req) => access.saveRole(req)),
);
router.put(
  "/roles/:id",
  authenticate,
  authorize("roles:manage"),
  action((req) => access.saveRole(req, req.params.id)),
);
router.patch(
  "/roles/:id/status",
  authenticate,
  authorize("roles:manage"),
  action((req) =>
    access.roleStatus(
      req,
      req.params.id,
      req.query.enable === "true"
        ? true
        : req.query.enable === "false"
          ? false
          : undefined,
    ),
  ),
);
router.delete(
  "/roles/:id",
  authenticate,
  authorize("roles:manage"),
  action((req) => access.roleStatus(req, req.params.id, false)),
);
router.get(
  "/permissions",
  authenticate,
  authorize("roles:manage"),
  action((req) => access.permissions(req)),
);
router.get(
  "/applications",
  authenticate,
  authorize("roles:manage"),
  action((req) =>
    req.user.subscriptionLicense.applications
      .map((a) => ({ applicationName: a.code }))
      .concat([{ applicationName: "IAM" }]),
  ),
);
module.exports = (req, res, next) =>
  require("../services/subscription-access").managed()
    ? router(req, res, next)
    : next();
