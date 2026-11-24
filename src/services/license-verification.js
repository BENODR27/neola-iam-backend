const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
function customerDeployment(env = process.env) {
  return (
    env.NEOLA_CUSTOMER_DEPLOYMENT === "true" ||
    fs.existsSync(path.join(__dirname, "../customer-policy.json"))
  );
}
function publicKey(env = process.env) {
  if (!env.CONTROL_LICENSE_PUBLIC_KEY_FILE)
    throw Error("Configure the provider license public key file");
  const key = crypto.createPublicKey(
    fs.readFileSync(env.CONTROL_LICENSE_PUBLIC_KEY_FILE),
  );
  if (key.asymmetricKeyType !== "ed25519")
    throw Error("The provider license public key must be Ed25519");
  return key;
}
function assertCustomerConfiguration(env = process.env) {
  if (!customerDeployment(env)) return;
  if (env.CONTROL_PLANE_MODE !== "subscription")
    throw Error("Customer distributions require subscription enforcement");
  let origin;
  try {
    origin = new URL(env.CONTROL_API_URL);
  } catch {
    throw Error("Configure the HTTPS provider origin");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error(
      "Customer distributions require an HTTPS provider origin without credentials or paths",
    );
  if (
    !/^[a-f0-9-]{36}$/i.test(env.CONTROL_INSTANCE_ID || "") ||
    !/^[a-f0-9]{64}$/i.test(env.CONTROL_INSTANCE_KEY || "")
  )
    throw Error("Configure this customer installation ID and activation key");
  publicKey(env);
}
function verifyLicense(
  envelope,
  instanceId,
  env = process.env,
  now = Date.now(),
) {
  if (!env.CONTROL_LICENSE_PUBLIC_KEY_FILE && !customerDeployment(env))
    return { value: envelope, expiresAt: now + 15000 };
  const lease = envelope?.lease;
  if (
    !lease ||
    typeof lease.payload !== "string" ||
    lease.payload.length > 2000000 ||
    typeof lease.signature !== "string" ||
    !/^[A-Za-z0-9_-]{86}$/.test(lease.signature)
  )
    throw Error("Signed license lease required");
  const bytes = Buffer.from(lease.payload, "base64url");
  if (
    !crypto.verify(
      null,
      bytes,
      publicKey(env),
      Buffer.from(lease.signature, "base64url"),
    )
  )
    throw Error("Invalid license signature");
  const claims = JSON.parse(bytes.toString("utf8"));
  if (
    claims.version !== 1 ||
    claims.iss !== "neola-control" ||
    claims.aud !== "neola-erp-license" ||
    claims.instance_id !== instanceId ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= now ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 15000 ||
    claims.iat > now + 2000 ||
    !claims.entitlements
  )
    throw Error("Expired or incorrectly bound license lease");
  if (
    claims.entitlements.active &&
    claims.entitlements.instance_id !== instanceId
  )
    throw Error("License installation mismatch");
  return { value: claims.entitlements, expiresAt: claims.exp };
}
module.exports = {
  customerDeployment,
  assertCustomerConfiguration,
  verifyLicense,
};
