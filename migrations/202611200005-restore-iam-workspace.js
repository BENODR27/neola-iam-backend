const localPermissions = [
  "IAM-APP",
  "users:manage",
  "roles:manage",
  "access-scopes:manage",
];
module.exports = {
  async up(q) {
    await q.sequelize.transaction(async (transaction) => {
      for (const name of localPermissions)
        await q.sequelize.query(
          "INSERT INTO app_permissions(name,appname,enabled) VALUES(:name,'IAM',true) ON CONFLICT(name) DO NOTHING",
          { replacements: { name }, transaction },
        );
      await q.sequelize.query(
        "INSERT INTO app_applications(application_name,application_icon,required_permission) VALUES('IAM','bi-shield-lock','IAM-APP') ON CONFLICT(application_name) DO NOTHING",
        { transaction },
      );
      const menu = [
        {
          label: "Users & access",
          link: "/adminv2/user",
          icon: "bi-people",
          permission: "users:manage",
        },
        {
          label: "Roles & permissions",
          link: "/adminv2/role",
          icon: "bi-shield-check",
          permission: "roles:manage",
        },
      ];
      await q.sequelize.query(
        "INSERT INTO app_application_navigation(application_name,landing_route,navbar_items) VALUES('IAM','/adminv2/user',:menu) ON CONFLICT(application_name) DO NOTHING",
        { replacements: { menu: JSON.stringify(menu) }, transaction },
      );
      await q.sequelize.query(
        "INSERT INTO app_roles(name,enabled) VALUES('IAM Identity Administrator',true) ON CONFLICT(name) DO NOTHING",
        { transaction },
      );
      await q.sequelize.query(
        "INSERT INTO app_role_permissions(role_id,permission_id) SELECT r.id,p.id FROM app_roles r CROSS JOIN app_permissions p WHERE r.name='IAM Identity Administrator' AND p.name IN (:names) ON CONFLICT DO NOTHING",
        { replacements: { names: localPermissions }, transaction },
      );
      // Restore only the explicitly reviewed installation administrators, never ordinary employees.
      await q.sequelize.query(
        `INSERT INTO app_user_roles(employee_code,role_id)
    SELECT a.user_id,r.id FROM app_control_adoptions a CROSS JOIN app_roles r
    WHERE r.name='IAM Identity Administrator' AND a.rolled_back_at IS NULL
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.original_roles) old_role WHERE (old_role->>'enabled')::boolean AND (old_role->'permissions') ? '*')
    ON CONFLICT DO NOTHING`,
        { transaction },
      );
    });
  },
  async down() {
    throw new Error(
      "IAM identity grants and navigation are retained; use a reviewed forward migration",
    );
  },
};
