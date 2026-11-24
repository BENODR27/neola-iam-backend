// Reviewed deployment bootstrap only; no passwords or role snapshots are rewritten by this client.
async function adoptCustomerAdmin({
  origin,
  key,
  username,
  apply = false,
  expectedHash,
  request = fetch,
}) {
  if (!origin || !key || !username)
    throw Error(
      "Set IAM_API_URL, CONTROL_INSTANCE_KEY and SUPERADMIN_EMPLOYEE_CODE",
    );
  if (apply && !expectedHash)
    throw Error(
      "Preview first, then pass --expected-hash with the reviewed source_hash",
    );
  const base = new URL("/v3/api/auth/internal/control", origin);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw Error("Use the intended IAM HTTP(S) origin");
  const headers = {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
  let response = await request(base.href + "/legacy-preview", {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw Error("IAM migration preview was rejected (" + response.status + ")");
  const preview = await response.json(),
    user = preview.items.find((u) => u.username === username);
  if (!user) throw Error("Configured initial administrator was not found");
  if (user.adopted)
    return {
      username,
      id: user.id,
      adopted: true,
      message: "Existing adoption preserved",
    };
  if (!apply)
    return {
      username,
      id: user.id,
      adopted: false,
      source_hash: preview.source_hash,
      roles: user.roles.map((r) => r.name),
      scopeCount: user.scopes.length,
      message: "Review this identity and source_hash before applying",
    };
  if (preview.source_hash !== expectedHash)
    throw Error("IAM changed after review; request a new preview");
  response = await request(base.href + "/legacy-adopt", {
    method: "POST",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      source_hash: expectedHash,
      user_ids: [String(user.id)],
    }),
  });
  if (!response.ok)
    throw Error("IAM adoption was rejected (" + response.status + ")");
  return response.json();
}
if (require.main === module) {
  require("dotenv").config();
  const index = process.argv.indexOf("--expected-hash");
  adoptCustomerAdmin({
    origin: process.env.IAM_API_URL,
    key: process.env.CONTROL_INSTANCE_KEY,
    username: process.env.SUPERADMIN_EMPLOYEE_CODE,
    apply: process.argv.includes("--apply"),
    expectedHash: index >= 0 ? process.argv[index + 1] : undefined,
  })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
module.exports = { adoptCustomerAdmin };
