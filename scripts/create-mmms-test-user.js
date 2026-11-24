const { navigation, applicationIcon } = require('../src/config/mmms-navigation');
// Explicitly isolated browser-test fixtures. Never run against an application database.
if (process.env.DB_NAME !== 'mmms_auth_workflow_test' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '55432') throw new Error('This fixture only runs against the disposable localhost MMMS test database');
const bcrypt = require('bcryptjs');
const { sequelize, User, Role, Permission, Application, ApplicationNavigation } = require('../src/models');
async function main() {
  const [permission] = await Permission.findOrCreate({ where: { name: '*' }, defaults: { name: '*', appname: 'MMMS_TEST_ONLY', enabled: true } });
  const [role] = await Role.findOrCreate({ where: { name: 'MMMS_TEST_SUPERVISOR' }, defaults: { name: 'MMMS_TEST_SUPERVISOR', enabled: true } });
  await role.addPermission(permission);
  const [user] = await User.findOrCreate({ where: { employeeCode: 'MMMS-TEST' }, defaults: { employeeCode: 'MMMS-TEST', employeeName: 'MMMS Workflow Tester', authCode: await bcrypt.hash('mmms-local-browser-test', 12), isActive: true } });
  await user.addRole(role);
  await Application.findOrCreate({ where: { applicationName: 'MMMS' }, defaults: { applicationName: 'MMMS', applicationIcon: 'bi-tools', requiredPermission: 'MMMS-APP' } });
  await Application.update({ applicationIcon }, { where: { applicationName: 'MMMS' } });
  await ApplicationNavigation.upsert({ applicationName: 'MMMS', landingRoute: '/mmms', navbarItems: JSON.stringify(navigation) });
  console.log('Isolated MMMS browser-test account and navigation ready');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
