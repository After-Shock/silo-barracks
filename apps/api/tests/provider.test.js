const test = require('node:test');
const assert = require('node:assert/strict');
const { getProvider, connectionConfig, isSupportedTask } = require('../classes/provider');

test('Silo is default and legacy providers require explicit selection', () => {
  assert.equal(getProvider({}), 'silo');
  assert.equal(getProvider({ MEDIA_SERVER_PROVIDER: 'jellyfin' }), 'jellyfin');
  assert.equal(getProvider({ IS_EMBY_API: 'true' }), 'emby');
  assert.throws(() => getProvider({ MEDIA_SERVER_PROVIDER: 'typo' }), /provider/i);
});

test('Silo environment aliases override stored legacy column names', () => {
  const config = connectionConfig({ JF_HOST: 'old', JF_API_KEY: 'old-key' }, {
    SILO_URL: 'https://silo.example', SILO_API_KEY: 'sa_test',
  });
  assert.equal(config.JF_HOST, 'https://silo.example');
  assert.equal(config.JF_API_KEY, 'sa_test');
  assert.equal(config.IS_SILO, true);
  assert.equal(config.IS_JELLYFIN, false);
});

test('empty optional Compose variables do not hide saved credentials', () => {
  const config = connectionConfig({ JF_HOST: 'saved-url', JF_API_KEY: 'saved-key' }, { SILO_URL: '', SILO_API_KEY: '' });
  assert.equal(config.JF_HOST, 'saved-url');
  assert.equal(config.JF_API_KEY, 'saved-key');
});

test('Silo disables plugin SQL import while retaining native catalog synchronization', () => {
  assert.equal(isSupportedTask('JellyfinPlaybackReportingPluginSync', {}), false);
  assert.equal(isSupportedTask('JellyfinSync', {}), true);
  assert.equal(isSupportedTask('JellyfinPlaybackReportingPluginSync', { MEDIA_SERVER_PROVIDER: 'jellyfin' }), true);
});
