// Portable, additive import for a dedicated ERP installation. Defaults to preview.
require("dotenv").config();
const { Client } = require("pg");
const { randomUUID } = require("node:crypto");
const { sequelize } = require("../src/models");
async function main() {
  const source = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.MMMS_DB_NAME || "mmms",
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,
  });
  try {
    await source.connect();
    const { rows } = await source.query(
      "SELECT * FROM mmms_master_records WHERE module IN ('organization','factories','departments','production-lines','organization-units','units','currencies','employees','contacts') ORDER BY id",
    );
    console.log(
      `${rows.length} source records; IDs and original payloads will be preserved`,
    );
    const people = (
      await source.query(
        "SELECT employee_number,name,email,phone,organization_id FROM mmms_technicians",
      )
    ).rows;
    const machines = (
      await source.query("SELECT organization_id,factory_id FROM mmms_machines")
    ).rows;
    console.log(
      `${people.length} technician identities can be copied to common employees without changing maintenance profiles`,
    );
    if (!process.argv.includes("--apply")) {
      console.log(
        "Preview only. Review a backup, then pass --apply to copy missing records.",
      );
      return;
    }
    await sequelize.transaction(async (transaction) => {
      for (const r of rows) {
        const originalType =
          r.data.unitType ||
          {
            organization: "Company",
            factories: "Factory",
            departments: "Department",
            "production-lines": "Production Line",
          }[r.module];
        const type = originalType === "Organization" ? "Company" : originalType;
        let org = r.organization_id || (type === "Company" ? r.id : null);
        const factory = r.factory_id || (type === "Factory" ? r.id : null);
        const data = {
          ...r.data,
          ...(type
            ? { unitType: type === "Organization" ? "Company" : type }
            : {}),
          migrationIssue:
            type && type !== "Company" && !r.data.parentId
              ? "Review the legacy hierarchy parent"
              : undefined,
        };
        if (type === "Factory") {
          const owners = [
            ...new Set(
              machines
                .filter((m) => m.factory_id === r.id)
                .map((m) => m.organization_id)
                .filter(Boolean),
            ),
          ];
          org ||= owners.length === 1 ? owners[0] : null;
          data.parentId ||= org;
        }
        if (type === "Department") data.parentId ||= factory;
        if (type === "Production Line" && !data.parentId) {
          const candidates = rows.filter(
            (d) =>
              d.module === "departments" && factory && d.factory_id === factory,
          );
          if (candidates.length === 1) data.parentId = candidates[0].id;
        }
        if (type && type !== "Company" && !data.parentId)
          data.migrationIssue = "Review the legacy hierarchy parent";
        else delete data.migrationIssue;
        data.organizationId = org;
        data.factoryId = factory;
        await sequelize.query(
          "INSERT INTO app_shared_masters(id,module,name,code,organization_id,factory_id,status,data) VALUES(:id,:module,:name,:code,:org,:factory,:status,CAST(:data AS jsonb)) ON CONFLICT(id) DO NOTHING",
          {
            replacements: {
              id: r.id,
              module: r.module,
              name: r.name,
              code: r.code,
              org,
              factory,
              status: r.status,
              data: JSON.stringify(data),
            },
            transaction,
          },
        );
      }
    });
    console.log(
      "Missing shared masters copied. Existing canonical records were preserved.",
    );
    await sequelize.transaction(async (transaction) => {
      for (const person of people)
        await sequelize.query(
          "INSERT INTO app_shared_masters(id,module,name,code,organization_id,status,data) SELECT CAST(:id AS uuid),'employees',:name,:code,:org,'Active',CAST(:data AS jsonb) WHERE NOT EXISTS(SELECT 1 FROM app_shared_masters WHERE module='employees' AND code=:code AND organization_id IS NOT DISTINCT FROM CAST(:org AS varchar))",
          {
            replacements: {
              id: randomUUID(),
              name: person.name,
              code: person.employee_number,
              org: person.organization_id || null,
              data: JSON.stringify({
                email: person.email || "",
                phone: person.phone || "",
                importedFrom: "MMMS technician identity",
              }),
            },
            transaction,
          },
        );
    });
  } finally {
    await source.end();
    await sequelize.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
