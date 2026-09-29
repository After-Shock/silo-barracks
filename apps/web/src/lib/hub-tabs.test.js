import test from 'node:test';
import assert from 'node:assert/strict';
import { usersHubTabIds, serverHubTabIds, showServerNav, pickTab } from './hub-tabs.js';

test('users hub always has Users; Invites only with Wizarr', () => {
  assert.deepEqual(usersHubTabIds({ wizarr: false }), ['users']);
  assert.deepEqual(usersHubTabIds({ wizarr: true }), ['users', 'invites']);
});

test('server jobs never appear on Silo; automation follows its flag', () => {
  assert.deepEqual(serverHubTabIds({ isAdmin: true, isSilo: true, automation: false }), []);
  assert.deepEqual(serverHubTabIds({ isAdmin: true, isSilo: true, automation: true }), ['automation']);
  assert.deepEqual(serverHubTabIds({ isAdmin: true, isSilo: false, automation: true }), ['jobs', 'automation']);
  assert.deepEqual(serverHubTabIds({ isAdmin: false, isSilo: false, automation: false }), []);
  assert.equal(showServerNav({ isAdmin: true, isSilo: true, automation: false }), false);
  assert.equal(showServerNav({ isAdmin: false, isSilo: true, automation: true }), true);
});

test('requested tab falls back to the first visible tab', () => {
  assert.equal(pickTab(['users', 'invites'], 'invites'), 'invites');
  assert.equal(pickTab(['users'], 'invites'), 'users');
  assert.equal(pickTab(['users'], null), 'users');
  assert.equal(pickTab([], 'automation'), null);
});
