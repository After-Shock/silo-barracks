'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createSocketAuthenticator } = require('../ws');

function authenticate(middleware, token) {
  const socket = { handshake: { auth: { token } } };
  return new Promise(resolve => middleware(socket, error => resolve({ socket, error })));
}

test('socket authentication requires dashboard permission while allowing the internal publisher', async () => {
  const secret = 'socket-route-test-secret';
  const middleware = createSocketAuthenticator({
    jwtSecret: secret,
    resolveTokenAccess: async user => ({
      user,
      permissions: { dashboard: user === 'viewer' || user === 'internal', settings: user === 'settings' },
    }),
  });

  const viewer = await authenticate(middleware, jwt.sign({ user: 'viewer' }, secret));
  assert.equal(viewer.error, undefined);
  assert.equal(viewer.socket.permissions.dashboard, true);

  const settings = await authenticate(middleware, jwt.sign({ user: 'settings' }, secret));
  assert.match(settings.error.message, /permission/i);

  const internal = await authenticate(middleware, jwt.sign({ user: 'internal' }, secret));
  assert.equal(internal.error, undefined);
});
