'use strict';

function historyFailure(error, fallback = 'Unable to load Silo playback history') {
  if (error?.category === 'invalid_cursor') {
    return { status: 400, message: 'Silo playback history cursor expired or is invalid; restart from the first page' };
  }
  return { status: error?.status || 503, message: error?.message || fallback };
}

module.exports = { historyFailure };
