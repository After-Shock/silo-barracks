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

test('an upstream 401 never reaches the browser as 401 (it would sign the Barracks user out)', () => {
  const { upstreamStatus } = require('../classes/silo/history-errors');
  assert.equal(upstreamStatus({ status: 401 }), 502);
  assert.equal(historyFailureFor({ status: 401 }).status, 502);
  assert.equal(upstreamStatus({ status: 403 }), 403);
  assert.equal(upstreamStatus({ status: 404 }), 404);
  assert.equal(upstreamStatus({ status: 200 }), 503);
  assert.equal(upstreamStatus({}), 503);
  assert.equal(upstreamStatus(undefined, 500), 500);
});

function historyFailureFor(error) { return require('../classes/silo/history-errors').historyFailure(error); }
