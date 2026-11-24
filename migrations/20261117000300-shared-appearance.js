"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "app_branding_accounts",
        {
          id: { type: Sequelize.UUID, primaryKey: true },
          code: { type: Sequelize.STRING(80), allowNull: false, unique: true },
          name: { type: Sequelize.STRING(180), allowNull: false },
          theme: { type: Sequelize.JSONB, allowNull: false },
          revision: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
          },
          changes: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: [],
          },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );
      await queryInterface.createTable(
        "app_user_appearance",
        {
          user_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            references: { model: "app_users", key: "id" },
            onDelete: "CASCADE",
          },
          account_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "app_branding_accounts", key: "id" },
            onDelete: "SET NULL",
          },
          mode: {
            type: Sequelize.STRING(12),
            allowNull: false,
            defaultValue: "inherit",
          },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );
      await queryInterface.addIndex("app_user_appearance", ["account_id"], {
        transaction,
      });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("app_user_appearance", { transaction });
      await queryInterface.dropTable("app_branding_accounts", { transaction });
    });
  },
};
