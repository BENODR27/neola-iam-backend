// Upgrade only the original generated menu. Administrator-customized menus remain intact.
const original = [
  {
    "label": "Shared masters",
    "link": "/masters",
    "icon": "bi-diagram-3",
    "permission": "MASTERS-READ"
  }
];
const pages = [
  {
    "label": "Organization hierarchy",
    "link": "/masters/organization",
    "icon": "bi-diagram-3",
    "permission": "MASTERS-READ"
  },
  {
    "label": "Units of measure",
    "link": "/masters/units",
    "icon": "bi-rulers",
    "permission": "MASTERS-READ"
  },
  {
    "label": "Currencies",
    "link": "/masters/currencies",
    "icon": "bi-currency-exchange",
    "permission": "MASTERS-READ"
  },
  {
    "label": "Employees",
    "link": "/masters/employees",
    "icon": "bi-people",
    "permission": "MASTERS-READ"
  },
  {
    "label": "Contacts",
    "link": "/masters/contacts",
    "icon": "bi-person-lines-fill",
    "permission": "MASTERS-READ"
  },
  {
    "label": "Vendors",
    "link": "/masters/vendors",
    "icon": "bi-buildings",
    "permission": "MASTERS-READ"
  }
];
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE app_application_navigation SET navbar_items=:pages
       WHERE application_name='MASTERS' AND landing_route='/masters'
         AND CAST(navbar_items AS jsonb)=CAST(:original AS jsonb)`,
      { replacements: { pages: JSON.stringify(pages), original: JSON.stringify(original) } },
    );
  },
  async down() { throw new Error('Keep dedicated Masters navigation and administrator customizations'); },
};

