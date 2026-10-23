// Coalesces refresh requests: the first runs at once, later ones within intervalMs collapse
// into a single trailing run so the last change still lands. Runs never overlap.
function createRefreshThrottle(run, intervalMs, onError = console.error) {
  let timer = null;
  let lastStart = -Infinity;
  let chain = Promise.resolve();

  return function schedule() {
    if (timer) return;
    const wait = Math.max(0, lastStart + intervalMs - Date.now());
    timer = setTimeout(() => {
      timer = null;
      lastStart = Date.now();
      chain = chain.then(run).catch(onError);
    }, wait);
  };
}

module.exports = { createRefreshThrottle };
