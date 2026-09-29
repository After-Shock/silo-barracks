import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFleet } from './fleet-summary.js';

const snap = {
  totalActiveStreams: 3, pausedStreams: 1, partial: true,
  servers: [
    { id: 'p', name: 'Primary', isPrimary: true, enabled: true, state: 'connected', activeStreams: 2, pausedStreams: 1 },
    { id: 'x', name: 'Extra', enabled: true, state: 'unavailable', activeStreams: null, pausedStreams: null, lastSuccessAt: '2026-09-28T10:00:00Z' },
    { id: 'off', name: 'Off', enabled: false, state: 'disabled', activeStreams: 0 },
  ],
};

test('all-servers summary counts enabled servers and keeps partial totals', () => {
  const s = summarizeFleet(snap, 'all', '');
  assert.equal(s.filter, 'all');
  assert.equal(s.total, 3);
  assert.equal(s.paused, 1);
  assert.deepEqual([s.connected, s.enabled], [1, 2]);
  assert.equal(s.partial, true);
  assert.deepEqual(s.pills.map(p => [p.id, p.count, p.state, p.selected]),
    [['all', 3, 'all', true], ['p', 2, 'connected', false], ['x', null, 'unavailable', false]]);
  assert.deepEqual(s.visibleServers.map(v => v.id), ['p', 'x']);
});

test('selecting a server scopes totals; unknown or disabled selection falls back to all', () => {
  const one = summarizeFleet(snap, 'p', '');
  assert.deepEqual([one.filter, one.total, one.paused, one.partial], ['p', 2, 1, false]);
  assert.equal(summarizeFleet(snap, 'x', '').partial, true);
  assert.equal(summarizeFleet(snap, 'off', '').filter, 'all');
  assert.equal(summarizeFleet(snap, 'gone', '').filter, 'all');
});

test('transport error never reports a number', () => {
  const s = summarizeFleet(snap, 'all', 'Unavailable');
  assert.equal(s.total, null);
  assert.equal(s.paused, null);
  assert.equal(s.partial, true);
  assert.equal(summarizeFleet(null, 'all', '').total, null);
});

test('during a transport error server pills do not show last-known counts as live', () => {
  const s = summarizeFleet(snap, 'all', 'Unavailable');
  assert.deepEqual(s.pills.map(p => [p.id, p.count, p.state]),
    [['all', null, 'all'], ['p', null, 'unavailable'], ['x', null, 'unavailable']]);
});
