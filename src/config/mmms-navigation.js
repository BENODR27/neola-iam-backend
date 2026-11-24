// One navigation catalog for MMMS registration and isolated workflow fixtures.
const definitions = [
  ['', 'Dashboard', 'bi-speedometer2', 'DASHBOARD'],
  ['organization', 'Organization', 'bi-diagram-3', 'ORGANIZATION'],
  ['factories', 'Factories and sites', 'bi-buildings', 'FACTORIES'],
  ['departments', 'Departments', 'bi-people', 'DEPARTMENTS'],
  ['production-lines', 'Floors and lines', 'bi-layout-three-columns', 'PRODUCTION-LINES'],
  ['machine-categories', 'Machine categories', 'bi-tags', 'MACHINE-CATEGORIES'],
  ['machines', 'Machines and history', 'bi-cpu', 'MACHINES'],
  ['allocations', 'Allocations', 'bi-pin-map', 'ALLOCATIONS'],
  ['transfers', 'Transfers', 'bi-arrow-left-right', 'TRANSFERS'],
  ['qr-management', 'QR labels and scanning', 'bi-qr-code-scan', 'QR-MANAGEMENT'],
  ['breakdowns', 'Breakdowns', 'bi-exclamation-triangle', 'BREAKDOWNS'],
  ['technicians', 'Mechanics', 'bi-person-gear', 'TECHNICIANS'],
  ['work-orders', 'Work orders', 'bi-clipboard2-pulse', 'WORK-ORDERS'],
  ['preventive-maintenance', 'Preventive maintenance', 'bi-calendar2-check', 'PREVENTIVE-MAINTENANCE'],
  ['inspections', 'Inspections', 'bi-clipboard-check', 'INSPECTIONS'],
  ['spare-parts', 'Spare parts', 'bi-box-seam', 'SPARE-PARTS'],
  ['costs', 'Maintenance costs', 'bi-cash-stack', 'COSTS'],
  ['vendors', 'Vendors and services', 'bi-truck', 'VENDORS'],
  ['calibration', 'Calibration', 'bi-sliders2-vertical', 'CALIBRATION'],
  ['reports', 'Reports and analytics', 'bi-bar-chart-line', 'REPORTS'],
  ['notifications', 'Notifications', 'bi-bell', 'NOTIFICATIONS'],
  ['mobile', 'Factory-floor tasks', 'bi-phone', 'MOBILE'],
  ['configuration', 'Configuration', 'bi-gear', 'CONFIGURATION'],
  ['help', 'How to use MMMS', 'bi-book', 'HELP'],
];
const navigation = definitions.map(([path, label, icon, permission]) => ({ link: `/mmms${path ? '/' + path : ''}`, label, icon, permission: `MMMS-${permission}` }));
const applicationIcon = 'bi-wrench-adjustable-circle';
module.exports = { navigation, applicationIcon };
