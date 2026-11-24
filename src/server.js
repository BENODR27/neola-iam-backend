require("dotenv").config();
if (process.env.NODE_ENV === "development") {
  const runtime = require("node:path").resolve(
    __dirname,
    "../../tools/local-runtime.cjs",
  );
  if (require("node:fs").existsSync(runtime)) require(runtime)("iam");
}

if (
  process.env.NODE_ENV !== "development" &&
  (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET === "your-256-bit-secret-your-256-bit-secret")
) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters");
}

const app = require("./app");
require("./services/license-verification").assertCustomerConfiguration();
const { sequelize } = require("./models");
const { attachPresenceSocket } = require("./services/presence-socket");
const port = Number(process.env.PORT || 8082);

async function start() {
  await sequelize.authenticate();
  const server = app.listen(port, () =>
    console.log(`AuthGuard v2 API listening on port ${port}`),
  );
  const presenceSocket = attachPresenceSocket(server);
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    presenceSocket.close();
    server.close(async () => {
      try {
        await require("./services/telemetry.service").drainTelemetry({
          close: true,
        });
        await sequelize.close();
        process.exit(0);
      } catch (error) {
        console.error("Unable to complete IAM shutdown:", error.message);
        process.exit(1);
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Unable to start AuthGuard v2 API:", error);
  process.exitCode = 1;
});
