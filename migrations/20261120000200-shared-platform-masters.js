module.exports = {
  async up(q) {
    await q.sequelize.query(`CREATE TABLE app_shared_masters (
      id uuid PRIMARY KEY, module varchar(80) NOT NULL, name varchar(180) NOT NULL, code varchar(100),
      organization_id varchar(120), factory_id varchar(120), status varchar(60) NOT NULL DEFAULT 'Active',
      data jsonb NOT NULL DEFAULT '{}', revision bigint NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX app_shared_masters_page ON app_shared_masters(module,organization_id,factory_id,name,id);
      CREATE TABLE app_shared_master_audit(id bigserial PRIMARY KEY,record_id uuid NOT NULL,actor varchar(180) NOT NULL,action varchar(80) NOT NULL,before_value jsonb,after_value jsonb,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE app_shared_master_references(consumer varchar(80) NOT NULL,record_id uuid NOT NULL REFERENCES app_shared_masters(id),reference_count bigint NOT NULL CHECK(reference_count>=0),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(consumer,record_id));
      CREATE TABLE app_control_adoptions(user_id bigint PRIMARY KEY REFERENCES app_users(id),source_hash varchar(64) NOT NULL,original_roles jsonb NOT NULL,original_scopes jsonb NOT NULL,adopted_roles jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());`);
  },
  async down() { throw new Error('Shared masters and adoption snapshots are retained. Restore a reviewed backup instead of dropping historical data.'); }
};
