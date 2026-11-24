const test = require("node:test"),
  assert = require("node:assert/strict");
const { adoptCustomerAdmin } = require("../scripts/adopt-customer-admin");
test("customer bootstrap requires a reviewed preview and targets only the configured administrator", async () => {
  const calls = [],
    options = {
      origin: "http://iam:7001",
      key: "isolated-key",
      username: "initial-admin",
      request: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          json: async () =>
            url.endsWith("legacy-preview")
              ? {
                  source_hash: "reviewed",
                  items: [
                    {
                      id: "1",
                      username: "initial-admin",
                      roles: [{ name: "ADMIN" }],
                      scopes: [],
                      adopted: false,
                    },
                  ],
                }
              : { migrated: 1 },
        };
      },
    };
  const preview = await adoptCustomerAdmin(options);
  assert.equal(preview.source_hash, "reviewed");
  assert.equal(calls.length, 1);
  await assert.rejects(
    adoptCustomerAdmin({ ...options, apply: true }),
    /Preview first/,
  );
  await assert.rejects(
    adoptCustomerAdmin({ ...options, apply: true, expectedHash: "stale" }),
    /changed after review/,
  );
  const result = await adoptCustomerAdmin({
    ...options,
    apply: true,
    expectedHash: "reviewed",
  });
  assert.equal(result.migrated, 1);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), {
    source_hash: "reviewed",
    user_ids: ["1"],
  });
});
