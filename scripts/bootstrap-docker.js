'use strict';

// An explicit clean-install bootstrap, separate from organization-specific seeders.
const bcrypt = require('bcryptjs');
const Sequelize = require('sequelize');
const { sequelize, User, Role, Permission, Application, ApplicationNavigation } = require('../src/models');
const { navigation, applicationIcon } = require('../src/config/mmms-navigation');

async function bootstrap() {
  const employeeCode = process.env.SUPERADMIN_EMPLOYEE_CODE;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!employeeCode || !password || password.length < 12 || (process.env.JWT_SECRET || '').length < 32) {
    throw new Error('Set SUPERADMIN_EMPLOYEE_CODE, SUPERADMIN_PASSWORD (12+ characters) and JWT_SECRET (32+ characters)');
  }
  await sequelize.transaction(async (transaction) => {
    const options = { transaction };
    const existing = await User.findOne({ where: { employeeCode }, ...options });
    if (existing) {
      const roles = await existing.getRoles(options);
      if (!roles.some((role) => role.name === 'ADMIN' && role.enabled)) {
        throw new Error('Configured bootstrap employee already exists without ADMIN; refusing to elevate it');
      }
      console.log('Existing administrator preserved; password and grants unchanged');
    } else {
      if (await User.count(options)) throw new Error('IAM already has users; use an existing administrator instead of bootstrapping another');
      const [permission] = await Permission.findOrCreate({ where: { name: '*' }, defaults: { enabled: true }, ...options });
      const [role] = await Role.findOrCreate({ where: { name: 'ADMIN' }, defaults: { enabled: true }, ...options });
      await role.addPermission(permission, options);
      const user = await User.create({ employeeCode, employeeName: process.env.SUPERADMIN_NAME || 'Platform Administrator', authCode: await bcrypt.hash(password, 12), isActive: true }, options);
      await user.addRole(role, options);
      console.log('Created initial administrator');
    }
    const iamItems = [
      ['user', 'Users and access', 'bi-person-vcard', 'users:manage'],
      ['role', 'Roles', 'bi-people', 'roles:manage'],
      ['permission', 'Permissions', 'bi-key', 'permissions:manage'],
      ['theme', 'Themes and branding', 'bi-palette', 'themes:manage'],
      ['application', 'Applications', 'bi-grid', 'applications:manage'],
      ['workspace-navigation', 'Workspace navigation', 'bi-list-nested', 'applications:manage'],
      ['vendors', 'Vendors', 'bi-building', 'vendors:manage'],
    ].map(([route, label, icon, permission]) => ({ link: `/adminv2/${route}`, label, icon, permission }));
    const names = new Set(['MMMS-APP', 'superadmin', 'access-scopes:manage', ...navigation.map((item) => item.permission), ...iamItems.map((item) => item.permission)]);
    for (const name of names) await Permission.findOrCreate({ where: { name }, defaults: { appname: name.startsWith('MMMS-') ? 'MMMS' : 'IAM', enabled: true }, ...options });
    await Application.findOrCreate({ where: { applicationName: 'MMMS' }, defaults: { applicationIcon, requiredPermission: 'MMMS-APP' }, ...options });
    for (const [applicationName, landingRoute, items] of [['MMMS', '/mmms', navigation], ['superadminv2', '/adminv2/welcome', iamItems]]) {
      await ApplicationNavigation.findOrCreate({ where: { applicationName }, defaults: { landingRoute, navbarItems: JSON.stringify(items) }, ...options });
    }
  });
  await require('../seeders/20261117000100-register-mmms-workflow-actions').up(sequelize.getQueryInterface(), Sequelize);
  console.log('Docker IAM catalog ready; existing navigation customizations preserved');
}

bootstrap().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
