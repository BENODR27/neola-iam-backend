// Broad legacy grants remain explicit all-hierarchy bundles. Fine grants never expand upward.
const hierarchyPermissions = {
  Company: "MASTERS-COMPANIES",
  "Business Unit": "MASTERS-BUSINESS-UNITS",
  Factory: "MASTERS-FACTORIES",
  Building: "MASTERS-BUILDINGS",
  Floor: "MASTERS-FLOORS",
  Department: "MASTERS-DEPARTMENTS",
  "Production Section": "MASTERS-SECTIONS",
  "Production Line": "MASTERS-LINES",
  "Machine Location": "MASTERS-LOCATIONS",
};
function expandMasterPermissions(names) {
  const result = new Set(names);
  for (const action of ["READ", "MANAGE"]) {
    if (result.has("MASTERS-ADMIN") || result.has("MASTERS-" + action))
      for (const prefix of Object.values(hierarchyPermissions)) {
        // Historically company writes required the installation master administrator.
        if (
          action === "MANAGE" &&
          prefix === "MASTERS-COMPANIES" &&
          !result.has("MASTERS-ADMIN")
        )
          continue;
        result.add(prefix + "-" + action);
      }
  }
  return [...result];
}
module.exports = { hierarchyPermissions, expandMasterPermissions };
