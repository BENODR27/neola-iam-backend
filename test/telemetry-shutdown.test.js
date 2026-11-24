const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { UsageDaily, TelemetryEvent } = require("../src/models");
const telemetry = require("../src/services/telemetry.service");
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("shutdown drains response telemetry including its delayed follow-up update and error write", async (t) => {
  const originalUsage = UsageDaily.findOrCreate,
    originalError = TelemetryEvent.create;
  t.after(() => {
    UsageDaily.findOrCreate = originalUsage;
    TelemetryEvent.create = originalError;
  });
  const find = deferred(),
    update = deferred(),
    error = deferred();
  let updated = false,
    recorded = false;
  UsageDaily.findOrCreate = async () => {
    await find.promise;
    return [
      {
        lastSeenAt: new Date(0),
        update: async () => {
          await update.promise;
          updated = true;
        },
      },
    ];
  };
  TelemetryEvent.create = async () => {
    await error.promise;
    recorded = true;
  };
  const req = {
      user: { id: 1 },
      get: () => null,
      originalUrl: "/test",
      method: "GET",
    },
    res = new EventEmitter();
  telemetry.requestTelemetry(req, res, () => {});
  res.emit("finish");
  const errorWrite = telemetry.recordError(
    req,
    new Error("expected test error"),
    500,
  );
  let drained = false;
  const drain = telemetry.drainTelemetry().then(() => {
    drained = true;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(drained, false);
  find.resolve();
  error.resolve();
  await errorWrite;
  await new Promise((r) => setImmediate(r));
  assert.equal(drained, false);
  assert.equal(recorded, true);
  update.resolve();
  await drain;
  assert.equal(updated, true);
  await telemetry.drainTelemetry({ close: true });
  UsageDaily.findOrCreate = () => {
    throw Error("Database is closed");
  };
  await telemetry.recordAppLogin(req, req.user); // Late callbacks cannot open a closed pool.
});
