const { Router } = require("express");
const jwt = require("jsonwebtoken");
const { sequelize } = require("../models");
const service = require("../services/shared-masters");
const asyncHandler = require("../middleware/asyncHandler");
const HttpError = require("../errors/HttpError");
const router = Router();
router.use("/internal", (req, res, next) => {
  try {
    const token = (req.get("authorization") || "").replace(/^Bearer /, "");
    const claims = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: process.env.JWT_ISSUER || "platform-iam",
      audience: "platform-catalogs",
    });
    if (claims.sub !== "mmms-catalog-consumer") throw new Error();
    req.consumer = claims.sub;
    next();
  } catch {
    next(new HttpError(401, "Catalog service identity required"));
  }
});
router.get(
  "/internal/snapshot",
  asyncHandler(async (req, res) =>
    res.set("Cache-Control", "no-store").json({
      result: await service.query(
        "SELECT * FROM app_shared_masters ORDER BY id",
      ),
    }),
  ),
);
router.get(
  "/internal/access",
  asyncHandler(async (req, res) => {
    const license = await require("../services/subscription-access").license();
    res.json({
      active: license
        ? license.active && license.applications.some((a) => a.code === "MMMS")
        : true,
    });
  }),
);
router.put(
  "/internal/references",
  asyncHandler(async (req, res) => {
    if (
      !Array.isArray(req.body.references) ||
      req.body.references.length > 100000
    )
      throw new HttpError(400, "Invalid reference inventory");
    await sequelize.transaction(async (transaction) => {
      for (const r of req.body.references) {
        if (!Number.isSafeInteger(r.count) || r.count < 0)
          throw new HttpError(400, "Invalid reference count");
        await sequelize.query(
          `INSERT INTO app_shared_master_references(consumer,record_id,reference_count) VALUES('MMMS',:id,:count) ON CONFLICT(consumer,record_id) DO UPDATE SET reference_count=excluded.reference_count,updated_at=now()`,
          { replacements: r, transaction },
        );
      }
    });
    res.json({ message: "References recorded" });
  }),
);
router.use(require("../middleware/authenticate"));
router.get(
  "/",
  asyncHandler(async (req, res) => res.json(await service.list(req))),
);
router.get("/types", (req, res) =>
  res.json({ kinds: service.kinds, parents: service.parents }),
);
router.post(
  "/",
  asyncHandler(async (req, res) =>
    res.status(201).json(await service.save(req.user, null, req.body)),
  ),
);
router.put(
  "/:id",
  asyncHandler(async (req, res) =>
    res.json(await service.save(req.user, req.params.id, req.body)),
  ),
);
module.exports = router;
