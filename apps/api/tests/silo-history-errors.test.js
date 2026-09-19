const test = require('node:test');
const assert = require('node:assert/strict');
const { historyFailure } = require('../classes/silo/history-errors');

test('history cursor failures tell operators to restart pagination', () => {
  assert.deepEqual(historyFailure({ status: 400, category: 'invalid_cursor', message: 'generic upstream error' }), {
    status: 400,
    message: 'Silo playback history cursor expired or is invalid; restart from the first page',
  });
});

test('history failures preserve safe upstream status and message', () => {
  assert.deepEqual(historyFailure({ status: 429, category: 'rate_limited', message: 'Silo request failed (429)' }), {
    status: 429,
    message: 'Silo request failed (429)',
  });
  assert.deepEqual(historyFailure(null, 'History unavailable'), { status: 503, message: 'History unavailable' });
});
