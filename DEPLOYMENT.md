# IAM API deployment

Host: **Customer server**. This repository builds independently; no shared external
Docker network is required. All services bind to `0.0.0.0` by default. Calls to
other services use their actual IP and published port, never `0.0.0.0`.

## Configure once

For a new configuration, copy `customer.env.example` to `.env.container` and
`.env.deploy.example` to `.env.deploy` without replacing existing files.
Fill the existing secrets and replace these destination placeholders:

```dotenv
DB_HOST=CUSTOMER_DATABASE_IP
DB_PORT=5432
DB_NAME=authguard
CONTROL_API_URL=https://PROVIDER_IP:5443
CONTROL_PORTAL_URL=https://PROVIDER_IP:5443
CORS_ORIGIN=https://CUSTOMER_IP:5443
```

Preserve database credentials, JWT issuer/audience, password hashes, instance ID/key
and the Console encryption key when restoring existing data. IAM, MMMS and storage
share the customer's JWT signing secret. Console logins are independent.
Set `STORAGE_VOLUME` in storage's deployment settings to its restored upload volume.
No frontend receives database passwords, signing private keys or activation keys.

## Run this repository

### First installation: base configuration and administrator

After database migrations, copy `seed.env.example` to private `.env.seed` and set
the desired administrator username/password. Use literal, unquoted values. Then:

```sh
docker compose --env-file .env.deploy -f compose.independent.yaml --profile maintenance run --rm --build seed
```

Optional npm alias: `npm run docker:seed`. Native CLI: `npm run db:seed:base`.
The seed registers missing MMMS page/action permissions and navigation, using
existing domain configuration; migrations provide IAM/Masters setup and standard
units/currency. It creates one administrator only when IAM has no users.
Repeat runs preserve passwords, disabled flags, existing grants and customized
menus. A different bootstrap username on a populated database is refused.

For a restored database, use migrations only. If an administrator explicitly
needs missing MMMS definitions registered without user creation, use:

```sh
docker compose --env-file .env.deploy -f compose.independent.yaml --profile maintenance run --rm --build seed node scripts/seed-base.js --configs-only
```

Seeding is an explicit maintenance job, never part of runtime startup. Do not put
`.env.seed` or real seed passwords in Git. It creates no customer scopes, assets,
commercial plans or subscriptions.

For customer production deployment:

```sh
docker compose --env-file .env.deploy -f compose.independent.yaml -f compose.customer.yaml up -d --build
```

Optional npm alias: `npm run docker:customer`. The customer profile enforces
production security; do not use the local runtime profile for a sold installation.

Set `CONTROL_LICENSE_PUBLIC_KEY_HOST_FILE` in `.env.deploy` to the provider public
verification key. The customer never receives the provider signing private key.
The customer image requires subscription mode, HTTPS provider origin, valid
installation credentials and signed license verification.

Put the customer frontend behind an HTTPS gateway for production. Port 5443 above
is an example external HTTPS port, not a new automatically started proxy. An
IP-based HTTPS endpoint needs a trusted TLS certificate valid for that IP. Existing
platform release documentation includes the gateway setup. Browser origins and
public links must match the real external HTTPS IP:port. Gateways forward to the
frontend HTTP port (ERP 5001, Console 5006). Restrict direct API/database ports to
trusted callers with the firewall.

Database migrations are explicit: run `npm run docker:migrate` during a maintenance
window before upgraded APIs. It never bootstraps accounts or resets passwords.

For local testing only, the base `compose.independent.yaml` and `.env.container.example`
remain available. The separate common-db test repository uses port 5433 and volume
`neola-test-pgdata`; set test API DB_HOST to its server IP and DB_PORT=5433. Keep
production customer/provider databases and credentials isolated. Databases and
uploads must already be restored; environment files do not migrate data. Never
commit real `.env` files or keys, delete volumes, or run account bootstrap on a
restored database.
