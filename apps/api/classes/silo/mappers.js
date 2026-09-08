'use strict';

function titleCase(value) {
  return String(value || '').replace(/(^|[_\s-])([a-z])/g,
    (_match, lead, letter) => lead === '_' ? ` ${letter.toUpperCase()}` : lead + letter.toUpperCase());
}

function ticks(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 10_000_000) : 0;
}

function bps(kbps) {
  if (kbps === null || kbps === undefined || kbps === '') return undefined;
  const value = Number(kbps);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : undefined;
}

function resolutionHeight(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const dimensions = normalized.match(/\d+\s*x\s*(\d+)/);
  if (dimensions) return Number(dimensions[1]);
  const vertical = normalized.match(/(\d{3,4})p/);
  return vertical ? Number(vertical[1]) : undefined;
}

function playMethod(row) {
  const method = String(row.effective_play_method || row.play_method || '').toLowerCase();
  return ({ direct: 'DirectPlay', remux: 'DirectStream', transcode: 'Transcode', audio: 'Audio' })[method]
    || titleCase(method || 'unknown');
}

function isEpisodeSession(row) {
  if (!row || typeof row !== 'object') return false;
  return String(row.media_type || '').toLowerCase() === 'episode'
    || String(row.episode_name || '').trim() !== ''
    || row.season_number !== undefined && row.season_number !== null
    || row.episode_number !== undefined && row.episode_number !== null;
}

function mediaStreams(row) {
  const streams = [];
  if (row.source_video_codec || row.source_video_resolution) {
    streams.push({
      Type: 'Video', Codec: row.source_video_codec || 'unknown', Height: resolutionHeight(row.source_video_resolution),
      DisplayTitle: row.source_video_resolution || row.source_video_codec || 'Unknown video',
      BitRate: bps(row.source_bitrate_kbps), IsExternal: false,
    });
  }
  if (row.source_audio_codec || row.source_audio_channels || row.source_audio_language || row.source_audio_title) {
    streams.push({
      Type: 'Audio', Codec: row.source_audio_codec || 'unknown', Channels: row.source_audio_channels ?? undefined,
      Language: row.source_audio_language || undefined,
      DisplayTitle: row.source_audio_title || row.source_audio_layout || row.source_audio_codec || 'Unknown audio',
      IsExternal: false,
    });
  }
  return streams;
}

function sessionToJellyfin(row, detail, serverId) {
  if (!row || typeof row !== 'object' || !row.session_id || row.user_id === undefined || row.user_id === null) {
    throw new TypeError('Invalid Silo session response');
  }
  const streams = mediaStreams(row);
  const isEpisode = isEpisodeSession(row);
  const poster = row.poster_url || detail?.poster_url || '';
  const streamBitrate = bps(row.stream_bitrate_kbps ?? row.target_bitrate_kbps ?? row.source_bitrate_kbps);
  const method = playMethod(row);
  const effectiveMethod = String(row.effective_play_method || row.play_method || '').toLowerCase();
  const transcoding = ['transcode', 'audio'].includes(effectiveMethod) ? {
    Bitrate: streamBitrate,
    CompletionPercentage: row.file_duration > 0 ? Number(row.position_seconds || 0) / row.file_duration * 100 : undefined,
    Container: String(row.target_container || row.source_container || ''),
    VideoCodec: String(row.target_video_codec || row.source_video_codec || 'unknown'),
    AudioCodec: String(row.target_audio_codec || row.source_audio_codec || 'unknown'),
    AudioChannels: row.target_audio_channels ?? row.source_audio_channels ?? undefined,
    Height: resolutionHeight(row.target_resolution || row.source_video_resolution),
    VideoBitrate: bps(row.target_bitrate_kbps),
    IsVideoDirect: ['direct', 'remux'].includes(String(row.video_decision || '').toLowerCase()),
    IsAudioDirect: ['direct', 'remux'].includes(String(row.audio_decision || '').toLowerCase()),
    TranscodeReasons: [],
  } : null;
  const item = {
    Id: row.content_id ? String(row.content_id) : '', SiloUnattributed: !row.content_id,
    Name: isEpisode ? (row.episode_name || row.media_title || '') : (row.media_title || detail?.title || ''),
    Type: isEpisode ? 'Episode' : itemType(row.media_type),
    RunTimeTicks: row.file_duration == null && detail?.runtime == null ? undefined : ticks(row.file_duration ?? detail.runtime * 60),
    SeriesName: row.series_name || detail?.series_title || undefined,
    SeriesId: detail?.series_id ? String(detail.series_id) : undefined,
    IndexNumber: row.episode_number ?? detail?.episode_number ?? undefined,
    ParentIndexNumber: row.season_number ?? detail?.season_number ?? undefined,
    Container: String(row.source_container || ''), Bitrate: bps(row.source_bitrate_kbps), MediaStreams: streams,
    ProviderIds: {}, SiloPosterUrl: poster || undefined,
  };
  return {
    MediaServerProvider: 'silo',
    Id: String(row.session_id), UserId: String(row.user_id), UserName: row.username || '',
    ProfileId: row.profile_id ? String(row.profile_id) : '', ProfileName: row.profile_name || '',
    Client: row.client_label || row.client_name || row.client_user_agent || 'Silo',
    DeviceName: row.client_label || row.client_name || row.node_display_name || 'Silo client',
    DeviceId: row.device_id ? String(row.device_id) : `silo-session:${row.session_id}`,
    ApplicationVersion: row.client_version || '', RemoteEndPoint: row.client_ip || '',
    ServerId: serverId || '', NowPlayingItem: item, SiloPosterUrl: poster || undefined,
    PlayState: { IsPaused: Boolean(row.is_paused), PositionTicks: ticks(row.position_seconds), PlayMethod: method,
      AudioStreamIndex: streams.findIndex(stream => stream.Type === 'Audio'), SubtitleStreamIndex: -1 },
    TranscodingInfo: transcoding,
    SiloDiagnostics: {
      clientBuild: row.client_build || undefined, clientChannel: row.client_channel || undefined,
      hardwareAcceleration: row.transcode_hw_accel || undefined, toneMapMode: row.tone_map_mode || undefined,
      executionNode: row.routing_execution_node_name || undefined, egressNode: row.routing_egress_node_name || undefined,
      sourceAudioCodec: row.source_audio_codec || undefined, sourceAudioChannels: row.source_audio_channels ?? undefined,
      targetAudioCodec: row.target_audio_codec || undefined, targetAudioChannels: row.target_audio_channels ?? undefined,
      reportedBitrate: bps(row.stream_bitrate_kbps),
    },
  };
}

function userToJellyfin(row, serverId) {
  return {
    Id: String(row.id), Name: row.username || '', ServerId: serverId || '',
    HasPassword: true, HasConfiguredPassword: true, LastLoginDate: row.last_active_at || undefined,
    Policy: { IsAdministrator: row.role === 'admin' || (Array.isArray(row.permissions) && row.permissions.includes('admin')),
      IsDisabled: row.enabled === false },
    SiloRole: row.role || '', SiloPermissions: Array.isArray(row.permissions) ? row.permissions : [],
  };
}

function libraryToJellyfin(row, serverId) {
  const collectionType = String(row.type || '').toLowerCase() === 'series' ? 'tvshows' : (row.type || 'mixed');
  return {
    Id: String(row.id), Name: row.name || '', ServerId: serverId || '', IsFolder: true,
    Type: 'CollectionFolder', CollectionType: collectionType, LocationType: 'FileSystem',
    ImageTags: {}, BackdropImageTags: [], SiloPosterUrl: row.poster_url || undefined,
  };
}

function itemType(type) {
  return ({ movie: 'Movie', series: 'Series', season: 'Season', episode: 'Episode', audiobook: 'Audio', audio: 'Audio', ebook: 'Book' })
    [String(type || '').toLowerCase()] || titleCase(type);
}

function itemToJellyfin(row, serverId) {
  const type = itemType(row.type);
  const release = row.release_date || row.first_air_date || row.air_date;
  const item = {
    Id: String(row.content_id), Name: row.title || '', ServerId: serverId || '', Type: type,
    IsFolder: ['Series', 'Season'].includes(type), PremiereDate: release || undefined,
    DateCreated: row.added_at || release || undefined, ProductionYear: row.year || undefined,
    RunTimeTicks: ticks(Number(row.runtime || 0) * 60), Genres: Array.isArray(row.genres) ? row.genres : [],
    Overview: row.overview || undefined, OfficialRating: row.content_rating || undefined,
    CommunityRating: row.rating_imdb ?? row.rating_tmdb ?? undefined, Status: row.show_status || row.status || undefined,
    ImageTags: {}, BackdropImageTags: [], MediaSources: [], SiloPosterUrl: row.poster_url || row.still_url || undefined,
    SiloBackdropUrl: row.backdrop_url || undefined,
  };
  if (type === 'Episode') {
    item.SeriesId = row.series_id ? String(row.series_id) : undefined;
    item.SeriesName = row.series_title || row.series_name || undefined;
    item.IndexNumber = row.episode_number ?? undefined;
    item.ParentIndexNumber = row.season_number ?? undefined;
    item.IsFolder = false;
  }
  return item;
}

function seasonToJellyfin(row, seriesId, seriesName, serverId) {
  return { ...itemToJellyfin({ ...row, type: 'season' }, serverId), SeriesId: String(seriesId),
    SeriesName: seriesName || '', IndexNumber: row.season_number, IsFolder: true };
}

function episodeToJellyfin(row, seriesId, seasonId, seriesName, serverId) {
  return {
    ...itemToJellyfin({ ...row, type: 'episode', poster_url: row.still_url }, serverId),
    SeriesId: String(seriesId), SeasonId: String(seasonId), SeriesName: seriesName || '',
    SeasonName: `Season ${row.season_number}`, IndexNumber: row.episode_number,
    ParentIndexNumber: row.season_number, IsFolder: false,
  };
}

function versionToMediaSource(version, itemId) {
  const streams = [];
  const video = Array.isArray(version.video_tracks) && version.video_tracks.length ? version.video_tracks
    : (version.codec_video ? [{ index: 0, codec: version.codec_video }] : []);
  const audio = Array.isArray(version.audio_tracks) && version.audio_tracks.length ? version.audio_tracks
    : (version.codec_audio ? [{ index: 0, codec: version.codec_audio }] : []);
  for (const track of video) streams.push({ ...track, Type: 'Video', Index: track.index, Codec: track.codec,
    BitRate: bps(version.bitrate), Width: track.width, Height: track.height, IsExternal: false });
  for (const track of audio) streams.push({ ...track, Type: 'Audio', Index: track.index, Codec: track.codec,
    Channels: track.channels, Language: track.language, IsExternal: false });
  for (const track of version.subtitle_tracks || []) streams.push({ ...track, Type: 'Subtitle', Index: track.index,
    Codec: track.codec, Language: track.language, IsExternal: Boolean(track.external) });
  return {
    Id: String(version.file_id), ItemId: String(itemId), Name: version.file_name || String(version.file_id),
    Path: version.file_path || '', Size: version.file_size || 0, Container: version.container || '',
    RunTimeTicks: ticks(version.duration), Bitrate: bps(version.bitrate), MediaStreams: streams,
    Type: 'Default', Protocol: 'File', SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: true,
  };
}

async function forEachLimited(values, limit, operation) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) await operation(values[next++]);
  });
  await Promise.all(workers);
}

module.exports = { isEpisodeSession, sessionToJellyfin, userToJellyfin, libraryToJellyfin, itemToJellyfin,
  seasonToJellyfin, episodeToJellyfin, versionToMediaSource, forEachLimited };
