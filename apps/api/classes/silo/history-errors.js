'use strict';

// Status to send the browser for a Silo failure. An upstream 401 means Barracks' Silo credentials
// were rejected, not that the viewer's session expired; the web client signs users out on 401.
function upstreamStatus(error, fallback = 503) {
  const status = Number(error?.status);
  if (status === 401) return 502;
  return status >= 400 && status < 600 ? status : fallback;
}

function historyFailure(error, fallback = 'Unable to load Silo playback history') {
  if (error?.category === 'invalid_cursor') {
    return { status: 400, message: 'Silo playback history cursor expired or is invalid; restart from the first page' };
  }
  return { status: upstreamStatus(error), message: error?.message || fallback };
}

module.exports = { historyFailure, upstreamStatus };
