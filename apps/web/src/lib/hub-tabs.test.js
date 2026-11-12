import test from 'node:test';
import assert from 'node:assert/strict';
import { usersHubTabIds, serverHubTabIds, serverHubReachableIds, showServerNav, resolveHubTabs, hubTabIds } from './hub-tabs.js';

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

test('explicitly requested tabs stay reachable by URL even when hidden from the nav', () => {
  assert.deepEqual(resolveHubTabs({ visible: ['users'], reachable: ['users', 'invites'], requested: 'invites' }), { active: 'invites', shown: ['users', 'invites'] });
  assert.deepEqual(resolveHubTabs({ visible: ['users', 'invites'], reachable: ['users', 'invites'], requested: 'invites' }), { active: 'invites', shown: ['users', 'invites'] });
  assert.deepEqual(resolveHubTabs({ visible: ['users'], reachable: ['users', 'invites'], requested: 'bogus' }), { active: 'users', shown: ['users'] });
  assert.deepEqual(resolveHubTabs({ visible: [], reachable: ['automation'], requested: 'automation' }), { active: 'automation', shown: ['automation'] });
  assert.deepEqual(resolveHubTabs({ visible: [], reachable: ['automation'], requested: null }), { active: null, shown: [] });
});

test('server jobs are never reachable on Silo', () => {
  assert.deepEqual(serverHubReachableIds({ isAdmin: true, isSilo: true }), ['automation']);
  assert.deepEqual(serverHubReachableIds({ isAdmin: true, isSilo: false }), ['jobs', 'automation']);
  assert.deepEqual(resolveHubTabs({ visible: [], reachable: serverHubReachableIds({ isAdmin: true, isSilo: true }), requested: 'jobs' }), { active: null, shown: [] });
});

test('PageTabs accepts upstream hubs that pass only tabs (statistics hub)', () => {
  const tabs = [{ id: 'overview' }, { id: 'wrapped' }, { id: 'hidden', visible: false }];
  assert.deepEqual(hubTabIds(tabs), { visible: ['overview', 'wrapped'], reachable: ['overview', 'wrapped'] });
  assert.deepEqual(resolveHubTabs({ ...hubTabIds(tabs), requested: 'wrapped' }), { active: 'wrapped', shown: ['overview', 'wrapped'] });
  assert.deepEqual(resolveHubTabs({ ...hubTabIds(tabs), requested: null }).active, 'overview');
  // Explicit fork lists still win.
  assert.deepEqual(hubTabIds(tabs, ['wrapped'], ['wrapped', 'hidden']), { visible: ['wrapped'], reachable: ['wrapped', 'hidden'] });
});
