const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionToJellyfin } = require('../classes/silo/mappers');

test('unattributed playback remains countable without inventing an upstream catalog identity', () => {
  const session = sessionToJellyfin({ session_id: 's', user_id: 'u', media_title: 'Unmatched stream',
    media_type: 'movie', source_bitrate_kbps: null, stream_bitrate_kbps: null, target_bitrate_kbps: null,
    file_duration: null }, null, 'server');
  assert.equal(session.NowPlayingItem.Id, '');
  assert.equal(session.NowPlayingItem.SiloUnattributed, true);
  assert.equal(session.NowPlayingItem.RunTimeTicks, undefined);
  assert.equal(session.NowPlayingItem.Bitrate, undefined);
  const audio = sessionToJellyfin({ session_id: 'a', user_id: 'u', play_method: 'transcode',
    source_audio_codec: 'aac', source_audio_channels: null, target_audio_channels: null }, null, 'server');
  assert.equal(audio.NowPlayingItem.MediaStreams[0].Channels, undefined);
  assert.equal(audio.TranscodingInfo.AudioChannels, undefined);
});

test('diagnostics preserve routing, client and source/target values without private raw payloads', () => {
  const session = sessionToJellyfin({ session_id: 's', user_id: 'u', content_id: 'i',
    client_build: '42', client_channel: 'beta', transcode_hw_accel: 'qsv', tone_map_mode: 'hable',
    routing_execution_node_name: 'GPU worker', routing_egress_node_name: 'Edge worker',
    target_audio_channels: 2, source_audio_channels: 6, target_audio_codec: 'aac', source_audio_codec: 'truehd',
    secret: 'do-not-copy', effective_play_method: 'future-format' }, null, 'server');
  assert.equal(session.SiloDiagnostics.hardwareAcceleration, 'qsv');
  assert.equal(session.SiloDiagnostics.executionNode, 'GPU worker');
  assert.equal(session.SiloDiagnostics.targetAudioChannels, 2);
  assert.equal(session.SiloDiagnostics.sourceAudioChannels, 6);
  assert.ok(!JSON.stringify(session).includes('do-not-copy'));
  assert.equal(session.PlayState.PlayMethod, 'Future-Format');
});

test('transcode reasons are derived only from Silo decisions and requested targets', () => {
  const s = sessionToJellyfin({ session_id: 's', user_id: 'u', effective_play_method: 'transcode',
    video_decision: 'transcode', audio_decision: 'direct', source_video_resolution: '2160p',
    requested_video_resolution: '1080p', source_video_codec: 'hevc', requested_video_codec: 'h264',
    file_duration: 100, position_seconds: 50 }, null, 'server');
  assert.deepEqual(s.TranscodingInfo.TranscodeReasons, ['Video transcode (2160p → 1080p, hevc → h264)']);
  assert.equal(s.TranscodingInfo.CompletionPercentage, undefined);
  const bare = sessionToJellyfin({ session_id: 'b', user_id: 'u', effective_play_method: 'transcode',
    video_decision: 'transcode', audio_decision: 'transcode' }, null, 'server');
  assert.deepEqual(bare.TranscodingInfo.TranscodeReasons, ['Video transcode', 'Audio transcode']);
  const direct = sessionToJellyfin({ session_id: 'd', user_id: 'u', effective_play_method: 'direct' }, null, 'server');
  assert.equal(direct.TranscodingInfo, null);
});
