const { getProvider } = require('./provider');

function API() {
  const provider = getProvider();
  const Adapter = require(provider === 'silo' ? './silo-api' : provider === 'emby' ? './emby-api' : './jellyfin-api');
  return new Adapter();
}

module.exports = API();
