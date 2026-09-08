exports.up = async knex => {
  await knex.schema.createTable('silo_servers', table => {
    table.text('id').primary();
    table.string('name', 80).notNullable();
    table.text('url').notNullable().unique();
    table.text('api_key_encrypted').notNullable();
    table.text('upstream_id').notNullable().unique();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};
exports.down = knex => knex.schema.dropTableIfExists('silo_servers');
