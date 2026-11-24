"use strict";

const permissions = [
  "MMMS-APP",
  "MMMS-DASHBOARD",
  "MMMS-MACHINES",
  "MMMS-TECHNICIANS",
  "MMMS-WORK-ORDERS",
  "MMMS-PREVENTIVE-MAINTENANCE",
  "MMMS-BREAKDOWNS",
  "MMMS-SPARE-PARTS",
  "MMMS-COSTS",
  "MMMS-MOBILE",
  "MMMS-QR-MANAGEMENT",
  "MMMS-REPORTS",
  "MMMS-PRODUCTION-INTEGRATION",
  "MMMS-ORGANIZATION",
  "MMMS-FACTORIES",
  "MMMS-DEPARTMENTS",
  "MMMS-PRODUCTION-LINES",
  "MMMS-MACHINE-CATEGORIES",
  "MMMS-ALLOCATIONS",
  "MMMS-TRANSFERS",
  "MMMS-INSPECTIONS",
  "MMMS-VENDORS",
  "MMMS-CALIBRATION",
  "MMMS-NOTIFICATIONS",
  "MMMS-CONFIGURATION",
  "MMMS-HELP",
  "MMMS-ORGANIZATION",
  "MMMS-FACTORIES",
  "MMMS-DEPARTMENTS",
  "MMMS-PRODUCTION-LINES",
  "MMMS-MACHINE-CATEGORIES",
  "MMMS-ALLOCATIONS",
  "MMMS-TRANSFERS",
  "MMMS-INSPECTIONS",
  "MMMS-VENDORS",
  "MMMS-CALIBRATION",
  "MMMS-NOTIFICATIONS",
  "MMMS-CONFIGURATION",
  "MMMS-HELP",
  "MMMS-ORGANIZATION",
  "MMMS-FACTORIES",
  "MMMS-DEPARTMENTS",
  "MMMS-PRODUCTION-LINES",
  "MMMS-MACHINE-CATEGORIES",
  "MMMS-ALLOCATIONS",
  "MMMS-TRANSFERS",
  "MMMS-INSPECTIONS",
  "MMMS-VENDORS",
  "MMMS-CALIBRATION",
  "MMMS-NOTIFICATIONS",
  "MMMS-CONFIGURATION",
  "MMMS-HELP",
];

const navigation = [
  ["bi-speedometer2", "/mmms", "Dashboard", "MMMS-DASHBOARD"],
  ["bi-cpu", "/mmms/machines", "Machines", "MMMS-MACHINES"],
  ["bi-people", "/mmms/technicians", "Technicians", "MMMS-TECHNICIANS"],
  ["bi-clipboard2-pulse", "/mmms/work-orders", "Work Orders", "MMMS-WORK-ORDERS"],
  ["bi-calendar2-week", "/mmms/preventive-maintenance", "Preventive Maintenance", "MMMS-PREVENTIVE-MAINTENANCE"],
  ["bi-exclamation-triangle", "/mmms/breakdowns", "Breakdowns", "MMMS-BREAKDOWNS"],
  ["bi-box-seam", "/mmms/spare-parts", "Spare Parts", "MMMS-SPARE-PARTS"],
  ["bi-cash-stack", "/mmms/costs", "Cost Management", "MMMS-COSTS"],
  ["bi-phone", "/mmms/mobile", "Mobile Maintenance", "MMMS-MOBILE"],
  ["bi-qr-code-scan", "/mmms/qr-management", "QR Access", "MMMS-QR-MANAGEMENT"],
  ["bi-bar-chart-line", "/mmms/reports", "Reports", "MMMS-REPORTS"],
  ["bi-diagram-3", "/mmms/production-integration", "Production Impact", "MMMS-PRODUCTION-INTEGRATION"],
  ["bi-building", "/mmms/organization", "Organization", "MMMS-ORGANIZATION"],
  ["bi-buildings", "/mmms/factories", "Factories & Sites", "MMMS-FACTORIES"],
  ["bi-diagram-3", "/mmms/departments", "Departments", "MMMS-DEPARTMENTS"],
  ["bi-layout-three-columns", "/mmms/production-lines", "Floors & Production Lines", "MMMS-PRODUCTION-LINES"],
  ["bi-tags", "/mmms/machine-categories", "Machine Categories", "MMMS-MACHINE-CATEGORIES"],
  ["bi-pin-map", "/mmms/allocations", "Machine Allocation", "MMMS-ALLOCATIONS"],
  ["bi-arrow-left-right", "/mmms/transfers", "Machine Transfers", "MMMS-TRANSFERS"],
  ["bi-clipboard-check", "/mmms/inspections", "Inspections", "MMMS-INSPECTIONS"],
  ["bi-person-lines-fill", "/mmms/vendors", "Vendors", "MMMS-VENDORS"],
  ["bi-sliders2-vertical", "/mmms/calibration", "Calibration", "MMMS-CALIBRATION"],
  ["bi-bell", "/mmms/notifications", "Notifications", "MMMS-NOTIFICATIONS"],
  ["bi-gear", "/mmms/configuration", "Application Configuration", "MMMS-CONFIGURATION"],
  ["bi-question-circle", "/mmms/help", "Help & User Guide", "MMMS-HELP"],
  ["bi-building", "/mmms/organization", "Organization", "MMMS-ORGANIZATION"],
  ["bi-buildings", "/mmms/factories", "Factories & Sites", "MMMS-FACTORIES"],
  ["bi-diagram-3", "/mmms/departments", "Departments", "MMMS-DEPARTMENTS"],
  ["bi-layout-three-columns", "/mmms/production-lines", "Floors & Production Lines", "MMMS-PRODUCTION-LINES"],
  ["bi-tags", "/mmms/machine-categories", "Machine Categories", "MMMS-MACHINE-CATEGORIES"],
  ["bi-pin-map", "/mmms/allocations", "Machine Allocation", "MMMS-ALLOCATIONS"],
  ["bi-arrow-left-right", "/mmms/transfers", "Machine Transfers", "MMMS-TRANSFERS"],
  ["bi-clipboard-check", "/mmms/inspections", "Inspections", "MMMS-INSPECTIONS"],
  ["bi-person-lines-fill", "/mmms/vendors", "Vendors", "MMMS-VENDORS"],
  ["bi-sliders2-vertical", "/mmms/calibration", "Calibration", "MMMS-CALIBRATION"],
  ["bi-bell", "/mmms/notifications", "Notifications", "MMMS-NOTIFICATIONS"],
  ["bi-gear", "/mmms/configuration", "Application Configuration", "MMMS-CONFIGURATION"],
  ["bi-question-circle", "/mmms/help", "Help & User Guide", "MMMS-HELP"],
  ["bi-building", "/mmms/organization", "Organization", "MMMS-ORGANIZATION"],
  ["bi-buildings", "/mmms/factories", "Factories & Sites", "MMMS-FACTORIES"],
  ["bi-diagram-3", "/mmms/departments", "Departments", "MMMS-DEPARTMENTS"],
  ["bi-layout-three-columns", "/mmms/production-lines", "Floors & Production Lines", "MMMS-PRODUCTION-LINES"],
  ["bi-tags", "/mmms/machine-categories", "Machine Categories", "MMMS-MACHINE-CATEGORIES"],
  ["bi-pin-map", "/mmms/allocations", "Machine Allocation", "MMMS-ALLOCATIONS"],
  ["bi-arrow-left-right", "/mmms/transfers", "Machine Transfers", "MMMS-TRANSFERS"],
  ["bi-clipboard-check", "/mmms/inspections", "Inspections", "MMMS-INSPECTIONS"],
  ["bi-person-lines-fill", "/mmms/vendors", "Vendors", "MMMS-VENDORS"],
  ["bi-sliders2-vertical", "/mmms/calibration", "Calibration", "MMMS-CALIBRATION"],
  ["bi-bell", "/mmms/notifications", "Notifications", "MMMS-NOTIFICATIONS"],
  ["bi-gear", "/mmms/configuration", "Application Configuration", "MMMS-CONFIGURATION"],
  ["bi-question-circle", "/mmms/help", "Help & User Guide", "MMMS-HELP"],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const existingPermissions = await queryInterface.sequelize.query(
      "SELECT id, name FROM app_permissions WHERE name IN (:names)",
      { replacements: { names: permissions }, type: Sequelize.QueryTypes.SELECT },
    );
    const existingNames = new Set(existingPermissions.map((permission) => permission.name));
    const missingPermissions = permissions
      .filter((name) => !existingNames.has(name))
      .map((name) => ({ name, appname: "MMMS", enabled: true }));
    if (missingPermissions.length > 0) {
      await queryInterface.bulkInsert("app_permissions", missingPermissions);
    }

    const [roles] = await queryInterface.sequelize.query(
      "SELECT id FROM app_roles WHERE name = 'ADMIN' LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (!roles?.id) throw new Error("ADMIN role is missing; run the AuthGuard permission seeder first");

    const seededPermissions = await queryInterface.sequelize.query(
      "SELECT id FROM app_permissions WHERE name IN (:names)",
      { replacements: { names: permissions }, type: Sequelize.QueryTypes.SELECT },
    );
    const existingLinks = await queryInterface.sequelize.query(
      "SELECT permission_id FROM app_role_permissions WHERE role_id = :roleId",
      { replacements: { roleId: roles.id }, type: Sequelize.QueryTypes.SELECT },
    );
    const linkedIds = new Set(existingLinks.map((link) => link.permission_id));
    const missingLinks = seededPermissions
      .filter((permission) => !linkedIds.has(permission.id))
      .map((permission) => ({ role_id: roles.id, permission_id: permission.id }));
    if (missingLinks.length > 0) await queryInterface.bulkInsert("app_role_permissions", missingLinks);

    const [applications] = await queryInterface.sequelize.query(
      "SELECT id FROM app_applications WHERE LOWER(application_name) = 'mmms' LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (!applications?.id) {
      await queryInterface.bulkInsert("app_applications", [{
        application_name: "MMMS",
        application_icon: "bi-cpu",
        required_permission: "MMMS-APP",
      }]);
    }

    const [navigationRows] = await queryInterface.sequelize.query(
      "SELECT application_name FROM app_application_navigation WHERE LOWER(application_name) = 'mmms' LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (!navigationRows?.application_name) {
      await queryInterface.bulkInsert("app_application_navigation", [{
        application_name: "MMMS",
        landing_route: "/mmms",
        navbar_items: JSON.stringify(navigation.map(([icon, link, label, permission]) => ({ icon, link, label, permission }))),
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM app_application_navigation WHERE LOWER(application_name) = 'mmms'",
    );
    await queryInterface.sequelize.query(
      "DELETE FROM app_applications WHERE LOWER(application_name) = 'mmms'",
    );
    await queryInterface.sequelize.query(
      "DELETE FROM app_role_permissions WHERE permission_id IN (SELECT id FROM app_permissions WHERE name LIKE 'MMMS-%')",
    );
    await queryInterface.sequelize.query(
      "DELETE FROM app_permissions WHERE name LIKE 'MMMS-%'",
    );
  },
};
