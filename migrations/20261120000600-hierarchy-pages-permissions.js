const pages = [
  {
    label: "Companies",
    link: "/masters/companies",
    icon: "bi-buildings",
    permission: "MASTERS-COMPANIES-READ",
  },
  {
    label: "Business units",
    link: "/masters/business-units",
    icon: "bi-diagram-2",
    permission: "MASTERS-BUSINESS-UNITS-READ",
  },
  {
    label: "Factories",
    link: "/masters/factories",
    icon: "bi-building-gear",
    permission: "MASTERS-FACTORIES-READ",
  },
  {
    label: "Buildings",
    link: "/masters/buildings",
    icon: "bi-building",
    permission: "MASTERS-BUILDINGS-READ",
  },
  {
    label: "Floors",
    link: "/masters/floors",
    icon: "bi-layers",
    permission: "MASTERS-FLOORS-READ",
  },
  {
    label: "Departments",
    link: "/masters/departments",
    icon: "bi-briefcase",
    permission: "MASTERS-DEPARTMENTS-READ",
  },
  {
    label: "Sections",
    link: "/masters/sections",
    icon: "bi-grid-1x2",
    permission: "MASTERS-SECTIONS-READ",
  },
  {
    label: "Lines",
    link: "/masters/lines",
    icon: "bi-distribute-horizontal",
    permission: "MASTERS-LINES-READ",
  },
  {
    label: "Locations",
    link: "/masters/locations",
    icon: "bi-geo-alt",
    permission: "MASTERS-LOCATIONS-READ",
  },
];
const original = [
  {
    label: "Organization hierarchy",
    link: "/masters/organization",
    icon: "bi-diagram-3",
    permission: "MASTERS-READ",
  },
  {
    label: "Shared masters",
    link: "/masters",
    icon: "bi-diagram-3",
    permission: "MASTERS-READ",
  },
];
module.exports = {
  async up(q) {
    await q.sequelize.transaction(async (transaction) => {
      for (const name of [
        "MASTERS-COMPANIES-READ",
        "MASTERS-COMPANIES-MANAGE",
        "MASTERS-BUSINESS-UNITS-READ",
        "MASTERS-BUSINESS-UNITS-MANAGE",
        "MASTERS-FACTORIES-READ",
        "MASTERS-FACTORIES-MANAGE",
        "MASTERS-BUILDINGS-READ",
        "MASTERS-BUILDINGS-MANAGE",
        "MASTERS-FLOORS-READ",
        "MASTERS-FLOORS-MANAGE",
        "MASTERS-DEPARTMENTS-READ",
        "MASTERS-DEPARTMENTS-MANAGE",
        "MASTERS-SECTIONS-READ",
        "MASTERS-SECTIONS-MANAGE",
        "MASTERS-LINES-READ",
        "MASTERS-LINES-MANAGE",
        "MASTERS-LOCATIONS-READ",
        "MASTERS-LOCATIONS-MANAGE",
      ])
        await q.sequelize.query(
          "INSERT INTO app_permissions(name,appname,enabled) VALUES(:name,'MASTERS',true) ON CONFLICT(name) DO NOTHING",
          { replacements: { name }, transaction },
        );
      const [rows] = await q.sequelize.query(
        "SELECT navbar_items FROM app_application_navigation WHERE application_name='MASTERS' FOR UPDATE",
        { transaction },
      );
      for (const row of rows) {
        const menu = JSON.parse(row.navbar_items);
        const next = menu.flatMap((item) =>
          original.some(
            (value) =>
              Object.keys(value).every((key) => value[key] === item[key]) &&
              Object.keys(item).length === Object.keys(value).length,
          )
            ? pages.filter(
                (page) => !menu.some((existing) => existing.link === page.link),
              )
            : [item],
        );
        if (JSON.stringify(next) !== JSON.stringify(menu))
          await q.sequelize.query(
            "UPDATE app_application_navigation SET navbar_items=:items WHERE application_name='MASTERS'",
            { replacements: { items: JSON.stringify(next) }, transaction },
          );
      }
    });
  },
  async down() {
    throw new Error("Preserve hierarchy permissions and customized navigation");
  },
};
