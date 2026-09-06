const db = require("../db");
const { connectionConfig } = require('./provider');

class Config {
  async getConfig() {
    try {
      //Manual overrides
      process.env.POSTGRES_USER = process.env.POSTGRES_USER ?? "postgres";

      //
      const { rows: config } = await db.query('SELECT * FROM app_config where "ID"=1');

      const state = this.#getConfigState(config);

      if (state < 1) {
        return { state: 0, error: "Config Details Not Found" };
      }

      const _config = config[0];

      return {
        ...connectionConfig(_config),
        JF_EXTERNAL_HOST: _config.settings?.EXTERNAL_URL,
        APP_USER: _config.APP_USER,
        APP_PASSWORD: _config.APP_PASSWORD,
        REQUIRE_LOGIN: _config.REQUIRE_LOGIN,
        settings: _config.settings,
        api_keys: _config.api_keys,
        state: state,
      };
    } catch (error) {
      console.log("Error fetching config:", error);
      return { error: "Config Details Not Found" };
    }
  }

  async getPreferedAdmin() {
    const config = await this.getConfig();
    return config.settings?.preferred_admin?.userid;
  }

  async getExcludedLibraries() {
    const config = await this.getConfig();
    return config.settings?.ExcludedLibraries ?? [];
  }

  #getConfigState(Configured) {
    let state = 0;
    try {
      //state 0 = no Jellyfin connection
      //state 1 = Jellyfin configured, admin access not configured
      //state 2 = Jellyfin configured and admin access configured

      if (Configured.length > 0) {
        const key = connectionConfig(Configured[0]).JF_API_KEY;
        const hasJellyfinApiKey = typeof key === 'string' && key.trim() !== '';
        const hasAdminUser = Configured[0].APP_USER !== null && Configured[0].APP_USER !== "";

        if (hasJellyfinApiKey && hasAdminUser) state = 2;
        else if (hasJellyfinApiKey) state = 1;
      }
      return state;
    } catch (error) {
      return state;
    }
  }
}

module.exports = Config;
