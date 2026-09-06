function getProvider(env = process.env) {
  const provider = (env.MEDIA_SERVER_PROVIDER || (env.IS_EMBY_API?.toLowerCase() === 'true' ? 'emby' : 'silo')).toLowerCase();
  if (!['silo', 'jellyfin', 'emby'].includes(provider)) throw new Error('Unknown media server provider');
  return provider;
}

function connectionConfig(row, env = process.env) {
  const provider = getProvider(env);
  return {
    JF_HOST: (provider === 'silo' && env.SILO_URL) || env.JF_HOST || row.JF_HOST,
    JF_API_KEY: (provider === 'silo' && env.SILO_API_KEY) || env.JF_API_KEY || row.JF_API_KEY,
    MEDIA_SERVER_PROVIDER: provider, IS_SILO: provider === 'silo', IS_JELLYFIN: provider === 'jellyfin',
  };
}

function isSupportedTask(task, env = process.env) {
  return getProvider(env) !== 'silo' || task !== 'JellyfinPlaybackReportingPluginSync';
}

module.exports = { getProvider, connectionConfig, isSupportedTask };
