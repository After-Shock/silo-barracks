'use strict';

const fields = {
  client_build: ['client_build'], client_channel: ['client_channel'],
  transcode_hw_accel: ['transcode_hw_accel'], tone_map_mode: ['tone_map_mode'],
  target_audio_channels: ['target_audio_channels'],
  node_routing: ['routing_execution_node_name', 'routing_egress_node_name'],
};
function sessionCapabilities(body) {
  if (!body || typeof body.available !== 'boolean') return { available: false };
  return Object.fromEntries(['available', ...Object.keys(fields)].map(key => [key, body[key] === true]));
}
function supportedSession(row, capabilities) {
  if (!capabilities) return row; // Older v1: show values when actually provided.
  const result = { ...row };
  for (const [flag, names] of Object.entries(fields)) {
    if (!capabilities.available || !capabilities[flag]) for (const name of names) delete result[name];
  }
  return result;
}
module.exports = { sessionCapabilities, supportedSession };
