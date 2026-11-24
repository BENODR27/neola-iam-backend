'use strict';

// Register action names only. No user or role receives a new grant.
const modules = ['ORGANIZATION', 'FACTORIES', 'DEPARTMENTS', 'PRODUCTION-LINES', 'MACHINE-CATEGORIES', 'MACHINES', 'ALLOCATIONS', 'TRANSFERS', 'WORK-ORDERS', 'BREAKDOWNS', 'PREVENTIVE-MAINTENANCE', 'INSPECTIONS', 'TECHNICIANS', 'SPARE-PARTS', 'COSTS', 'CALIBRATION', 'NOTIFICATIONS', 'CONFIGURATION', 'REPORTS', 'QR-MANAGEMENT', 'FILES', 'VENDORS'];
const actions = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'ASSIGN', 'VERIFY', 'EXPORT', 'PRINT'];
const names = [...modules.flatMap((module) => actions.map((action) => `MMMS-${module}-${action}`)), 'MMMS-TRANSFERS-RECEIVE', 'MMMS-SPARE-PARTS-TRANSACT', 'MMMS-SPARE-PARTS-ADJUST', 'MMMS-PREVENTIVE-MAINTENANCE-GENERATE', 'MMMS-COSTS-VOID'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const existing = await queryInterface.sequelize.query('SELECT name FROM app_permissions WHERE name IN (:names)', {
        replacements: { names }, type: Sequelize.QueryTypes.SELECT, transaction,
      });
      const missing = names.filter((name) => !existing.some((row) => row.name === name));
      if (missing.length) await queryInterface.bulkInsert('app_permissions', missing.map((name) => ({ name, appname: 'MMMS', enabled: true })), { transaction });
    });
  },
  async down() {
    // Retain definitions: administrators may have subsequently assigned them.
    throw new Error('Permission definitions must be retired through access administration after checking active grants');
  },
};
