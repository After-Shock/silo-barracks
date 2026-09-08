'use strict';
const { SiloRequestError } = require('./http');

function collection(body) {
  if (!body || !Array.isArray(body.items) || body.items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new SiloRequestError('Invalid Silo collection response');
  }
  if (body.page !== undefined && (!body.page || typeof body.page.has_more !== 'boolean')) {
    throw new SiloRequestError('Invalid Silo pagination response');
  }
  return body;
}

async function allPages(request, path, { timeoutMs = 8000, maxPages = 100, idField, ...options } = {}) {
  const deadline = Date.now() + timeoutMs;
  const rows = new Map();
  const cursors = new Set();
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SiloRequestError('Silo request timed out');
    // The pinned session loader enforces 100 despite the generated schema's 200.
    // 100 is accepted by both session and user collection operations.
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const body = collection(await request(`${path}?${query}`, { ...options, timeoutMs: remaining }));
    for (const row of body.items) {
      const id = row[idField];
      if (typeof id !== 'string' || !id) throw new SiloRequestError('Invalid Silo collection identity');
      rows.set(id, row);
    }
    if (!body.page?.has_more) return [...rows.values()];
    cursor = body.page.next_cursor;
    if (typeof cursor !== 'string' || !cursor || cursor.length > 8192 || cursors.has(cursor) || body.items.length === 0) {
      throw new SiloRequestError('Invalid Silo continuation cursor');
    }
    cursors.add(cursor);
  }
  throw new SiloRequestError('Silo page limit exceeded; snapshot incomplete');
}
module.exports = { collection, allPages };
