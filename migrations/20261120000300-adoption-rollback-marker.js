module.exports={async up(q){await q.sequelize.query('ALTER TABLE app_control_adoptions ADD COLUMN rolled_back_at timestamptz');},async down(){throw new Error('Adoption history is retained');}};
