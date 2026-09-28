import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_MESSAGE_TEMPLATES, SESSION_MESSAGE_TEMPLATE_GROUPS, applySessionMessageTemplate,
  defaultMessageDateTime, timeForTemplate } from './session-messages.js';

test('templates fill placeholders with safe fallbacks', () => {
  const t = SESSION_MESSAGE_TEMPLATES.find(x => x.id === 'checkin').text;
  assert.equal(applySessionMessageTemplate(t, { UserName: 'Sam', DeviceName: 'TV' }, 'Heat', ''),
    'Hi Sam on TV — can you check in when you get a moment?');
  assert.equal(applySessionMessageTemplate('{user} {device}', {}, '', ''), 'there your device');
});

test('time-based templates get a future local datetime', () => {
  assert.match(defaultMessageDateTime(10), /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  assert.ok(new Date(timeForTemplate({ defaultTonight: true })).getTime() > Date.now());
});

test('copy is Silo-branded and groups are ordered by first appearance', () => {
  assert.ok(!JSON.stringify(SESSION_MESSAGE_TEMPLATES).includes('Jellyfin'));
  assert.deepEqual(SESSION_MESSAGE_TEMPLATE_GROUPS, ['Write your own', 'Playback', 'Household', 'Server', 'Maintenance']);
});
