const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const service = require("../services/appearance.service");
const asyncHandler = require("../middleware/asyncHandler");
const router = express.Router();
router.use(authenticate);
router.use((req, res, next) =>
  req.user?.id
    ? next()
    : res.status(401).json({ message: "Sign in to configure appearance" }),
);
router.param("id", (req, res, next, id) =>
  id === "platform" ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? next()
    : res.status(422).json({ message: "Choose a valid branding account" }),
);
router.get(
  "/",
  asyncHandler(async (req, res) =>
    res.json({ result: await service.effective(req.user.id) }),
  ),
);
router.put(
  "/mode",
  asyncHandler(async (req, res) =>
    res.json({ result: await service.setMode(req.user.id, req.body.mode) }),
  ),
);
router.get(
  "/management",
  authorize("themes:manage"),
  asyncHandler(async (req, res) =>
    res.json({ result: await service.management() }),
  ),
);
router.post(
  "/accounts",
  authorize("themes:manage"),
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        result: await service.saveAccount(
          null,
          req.body,
          req.user.employeeCode,
        ),
      }),
  ),
);
router.put(
  "/accounts/:id",
  authorize("themes:manage"),
  asyncHandler(async (req, res) =>
    res.json({
      result: await service.saveAccount(
        req.params.id,
        req.body,
        req.user.employeeCode,
      ),
    }),
  ),
);
router.put(
  "/accounts/:id/members",
  authorize("themes:manage"),
  asyncHandler(async (req, res) =>
    res.json({
      result: await service.saveMembers(
        req.params.id,
        req.body.userIds,
        req.user.employeeCode,
      ),
    }),
  ),
);
module.exports = router;
