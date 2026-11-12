const JellyfinAPI = require("./jellyfin-api");
const EmbyAPI = require("./emby-api");
const SiloAPI = require("./silo-api");
const { getProvider } = require("./provider");
const { getActiveServerType } = require("./server-type");

// One client per server type, created on first use. The exported proxy always
// forwards to the client for the active server type, so switching between
// Jellyfin, Emby and the native Silo provider in settings takes effect without
// a restart.
const clients = new Map();
const BLOCKED_PROPS = new Set(["__proto__", "constructor", "prototype"]);
const CLASSES = { silo: SiloAPI, emby: EmbyAPI, jellyfin: JellyfinAPI };

function clientType() {
  const provider = getProvider();
  if (provider === "silo") return "silo";
  if (provider === "emby") return "emby";
  return getActiveServerType() === "emby" ? "emby" : "jellyfin";
}

function client() {
  const type = clientType();
  if (!clients.has(type)) clients.set(type, new CLASSES[type]());
  return clients.get(type);
}

module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      const api = client();
      const value = api[prop];
      return typeof value === "function" ? value.bind(api) : value;
    },
    set(_target, prop, value) {
      if (typeof prop !== "string" || BLOCKED_PROPS.has(prop)) return false;
      Reflect.set(client(), prop, value);
      return true;
    },
    has(_target, prop) {
      return prop in client();
    },
  }
);
