const test = require('node:test');
const assert = require('node:assert/strict');
const { navigation, applicationIcon } = require('../src/config/mmms-navigation');
const seed = require('../seeders/20261117000200-refresh-mmms-navigation');
test('MMMS navigation uses distinct available icons and exposes the usage guide', () => {
  const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../frontend/node_modules/bootstrap-icons/font/bootstrap-icons.css'), 'utf8');
  for (const icon of [applicationIcon, ...navigation.map((item) => item.icon)]) assert.ok(css.includes('.' + icon + '::before'), icon);
  assert.equal(new Set(navigation.map((item) => item.link)).size, navigation.length);
  assert.ok(navigation.some((item) => item.link === '/mmms/help' && item.permission === 'MMMS-HELP'));
});
test('navigation refresh preserves custom entries and changes no role grants', async () => {
  const updates = [];
  const current = [{ link: '/mmms/machines', label: 'Our equipment', icon: 'bi-tools', permission: 'MMMS-MACHINES' }, { link: '/custom', label: 'Custom', icon: 'bi-star', permission: 'custom:view' }];
  await seed.up({ sequelize: { transaction: (fn) => fn({}), query: async () => [{ navbar_items: JSON.stringify(current) }] }, bulkUpdate: async (table, values, where) => updates.push({ table, values, where }) }, { QueryTypes: { SELECT: 'SELECT' } });
  const entries = JSON.parse(updates.find((row) => row.table === 'app_application_navigation').values.navbar_items);
  assert.equal(entries[0].label, 'Our equipment'); assert.equal(entries[0].icon, 'bi-cpu');
  assert.deepEqual(entries[1], current[1]); assert.equal(entries[2].link, '/mmms/help');
  assert.ok(updates.every((row) => ['app_application_navigation', 'app_applications'].includes(row.table)));
});
