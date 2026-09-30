exports.up = knex => knex.schema.alterTable('silo_stream_peaks', table => {
  table.jsonb('streams_breakdown'); // servers contributing to the peak, 'all' scope only
  table.jsonb('transcodes_breakdown');
});
exports.down = knex => knex.schema.alterTable('silo_stream_peaks', table => {
  table.dropColumn('streams_breakdown');
  table.dropColumn('transcodes_breakdown');
});
