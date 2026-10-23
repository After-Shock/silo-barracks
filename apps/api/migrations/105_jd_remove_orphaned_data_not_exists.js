// NOT IN (SELECT ...) over ~300k ids falls back to a non-hashed SubPlan once the ids
// outgrow work_mem, rescanning the list per row (hours of CPU). NOT EXISTS plans as an
// anti-join. Same rows deleted: the compared id columns are NOT NULL.
exports.up = knex => knex.schema.raw(`
  CREATE OR REPLACE PROCEDURE jd_remove_orphaned_data() AS $$
  BEGIN
    DELETE FROM public.jf_library_episodes e
    WHERE NOT EXISTS (SELECT 1 FROM public.jf_library_items i WHERE i."Id" = e."SeriesId");

    DELETE FROM public.jf_library_seasons s
    WHERE NOT EXISTS (SELECT 1 FROM public.jf_library_items i WHERE i."Id" = s."SeriesId");

    DELETE FROM public.jf_item_info f
    WHERE f."Type" = 'Item'
      AND NOT EXISTS (SELECT 1 FROM public.jf_library_items i WHERE i."Id" = f."Id");

    DELETE FROM public.jf_item_info f
    WHERE f."Type" = 'Episode'
      AND NOT EXISTS (SELECT 1 FROM public.jf_library_episodes e WHERE e."EpisodeId" = f."Id");
  END;
  $$ LANGUAGE plpgsql;
`);

exports.down = knex => require('./031_jd_remove_orphaned_data').up(knex);
