const test = require('node:test');
const assert = require('node:assert/strict');
const { createRefreshThrottle } = require('../classes/refresh-throttle');

const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

test('refresh throttle runs once at once, then one trailing run per interval', async () => {
  let runs = 0;
  const schedule = createRefreshThrottle(async () => { runs++; }, 50);

  schedule();
  await tick(5);
  assert.equal(runs, 1);

  for (let i = 0; i < 10; i++) schedule();
  await tick(10);
  assert.equal(runs, 1, 'burst inside the interval waits');

  await tick(60);
  assert.equal(runs, 2, 'burst collapses into one trailing run');
});

test('refresh throttle never overlaps runs and survives a failed run', async () => {
  let active = 0, maxActive = 0, runs = 0;
  const errors = [];
  const schedule = createRefreshThrottle(async () => {
    runs++;
    active++; maxActive = Math.max(maxActive, active);
    await tick(40);
    active--;
    if (runs === 1) throw new Error('boom');
  }, 10, err => errors.push(err.message));

  schedule();
  await tick(15);
  schedule(); // interval elapsed while the first run is still going
  await tick(120);
  assert.equal(runs, 2);
  assert.equal(maxActive, 1);
  assert.deepEqual(errors, ['boom']);
});
