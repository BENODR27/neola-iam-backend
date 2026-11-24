'use strict';
const { navigation, applicationIcon } = require('../src/config/mmms-navigation');
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const rows = await queryInterface.sequelize.query('SELECT navbar_items FROM app_application_navigation WHERE application_name = :name', { replacements: { name: 'MMMS' }, type: Sequelize.QueryTypes.SELECT, transaction });
      if (!rows.length) return;
      const current = JSON.parse(rows[0].navbar_items || '[]');
      const updated = current.map((item) => ({ ...item, icon: navigation.find((entry) => entry.link === item.link)?.icon || item.icon }));
      if (!updated.some((item) => item.link === '/mmms/help')) updated.push(navigation.find((item) => item.link === '/mmms/help'));
      await queryInterface.bulkUpdate('app_application_navigation', { navbar_items: JSON.stringify(updated) }, { application_name: 'MMMS' }, { transaction });
      await queryInterface.bulkUpdate('app_applications', { application_icon: applicationIcon }, { application_name: 'MMMS' }, { transaction });
    });
  },
  async down() { throw new Error('Restore navigation through IAM configuration; no role grants were changed'); },
};
