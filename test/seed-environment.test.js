const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { seedEnvironment } = require("../scripts/seed-base");

test("seed file preserves literal password characters and cannot replace database settings", () => {
  const previous = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "iam-seed-env-"));
  try {
    process.chdir(directory);
    fs.writeFileSync(
      ".env.seed",
      "SUPERADMIN_EMPLOYEE_CODE=seed.admin\nSUPERADMIN_PASSWORD=literal#password=$value\nDB_HOST=untrusted.invalid\n",
    );
    const result = seedEnvironment({});
    assert.equal(result.SUPERADMIN_PASSWORD, "literal#password=$value");
    assert.equal(result.DB_HOST, undefined);
    assert.equal(
      seedEnvironment({ SUPERADMIN_PASSWORD: "explicit-value" })
        .SUPERADMIN_PASSWORD,
      "explicit-value",
    );
  } finally {
    process.chdir(previous);
  }
});
