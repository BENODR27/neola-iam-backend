const express = require("express");

const router = express.Router();
router.use('/shared-masters', require('./shared-masters.routes'));
router.use('/internal/control', require('./subscription-control.routes'));
router.get('/runtime/access', require('../middleware/authenticate'), (req, res) => {
  res.set('Cache-Control', 'no-store').json({ permissions: req.user.subscriptionPermissions || require('../services/subscription-access').grants(req.user), accessScopes: req.user.accessScopes || [] });
});
router.get('/control-settings', (req, res) => res.json({ managed: require('../services/subscription-access').managed(), sharedMasters:process.env.PLATFORM_MASTERS_MODE==='shared', portalUrl: process.env.CONTROL_PORTAL_URL || null }));
router.use(require('./iam-access.routes'));
router.use(require('../services/subscription-access').management);
router.use(require("./auth.routes"));
router.use("/users", require("./users.routes"));
router.use("/roles", require("./roles.routes"));
router.use("/permissions", require("./permissions.routes"));
router.use("/applications", require("./applications.routes"));
router.use("/appearance", require("./appearance.routes"));
router.use("/themes", require("./themes.routes"));
router.use("/pda", require("./pda.routes"));
router.use("/vendors", require("./vendors.routes"));
router.use("/telemetry", require("./telemetry.routes"));

module.exports = router;
