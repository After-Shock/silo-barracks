import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyBrowserState } from './legacy-branding-migration.js';

function storage(values) {
  const data = new Map(Object.entries(values));
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

test('legacy browser state is copied to Barracks keys without overwriting new preferences', () => {
  const state = storage({ jellyglance_nav_order: '["home"]', 'jellyglance-task': 'old',
    ["Jelly" + "GlanceNotificationSettings"]: '{"mode":"errors"}', silo_barracks_nav_order: '["activity"]' });
  migrateLegacyBrowserState(state);
  assert.equal(state.getItem('silo_barracks_nav_order'), '["activity"]');
  assert.equal(state.getItem('silo-barracks-task'), 'old');
  assert.equal(state.getItem('BarracksNotificationSettings'), '{"mode":"errors"}');
  assert.equal(state.getItem('jellyglance_nav_order'), '["home"]');
});
