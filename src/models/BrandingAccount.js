module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "BrandingAccount",
    {
      id: { type: DataTypes.UUID, primaryKey: true },
      code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(180), allowNull: false },
      theme: { type: DataTypes.JSONB, allowNull: false },
      revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      changes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    },
    { tableName: "app_branding_accounts", timestamps: true, underscored: true },
  );
