module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "UserAppearance",
    {
      userId: { type: DataTypes.BIGINT, primaryKey: true, field: "user_id" },
      accountId: { type: DataTypes.UUID, field: "account_id" },
      mode: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: "inherit",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "updated_at",
      },
    },
    { tableName: "app_user_appearance", timestamps: false },
  );
