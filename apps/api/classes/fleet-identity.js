function createIdentityGuard({ identify }) {
  // Only the current connection is cached; credentials are never published.
  let cached;
  const pending = new Map();
  async function identity(primary) {
    const key = JSON.stringify([primary.url, primary.apiKey]);
    if (cached?.key === key) return cached.id;
    if (!pending.has(key)) {
      const request = Promise.resolve().then(() => identify(primary)).then(value => {
        const id = typeof value === 'string' ? value : value?.id;
        if (!id) throw new Error('Identity unavailable');
        cached = { key, id: String(id) };
        return cached.id;
      }).finally(() => pending.delete(key));
      pending.set(key, request);
    }
    return pending.get(key);
  }
  return { async resolve(servers) {
    const primary = servers.find(server => server.isPrimary);
    if (!primary) return servers;
    let id;
    try { id = await identity(primary); } catch { /* Retry next poll without blocking extras. */ }
    return servers.filter(server => server.isPrimary || (server.url !== primary.url
      && (!id || String(server.upstreamId) !== id))).map(server => server.isPrimary && !id
      ? { ...server, apiKey: null, identityUnavailable: true } : server);
  } };
}
module.exports = { createIdentityGuard };
