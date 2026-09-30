exports.up = async knex => {
  await knex.schema.createTable('silo_stream_peaks', table => {
    table.text('scope').primary(); // 'all' or a fleet server id
    table.integer('streams').notNullable().defaultTo(0);
    table.integer('streams_transcodes').notNullable().defaultTo(0);
    table.timestamp('streams_at', { useTz: true });
    table.integer('transcodes').notNullable().defaultTo(0);
    table.timestamp('transcodes_at', { useTz: true });
  });
};
exports.down = knex => knex.schema.dropTableIfExists('silo_stream_peaks');
