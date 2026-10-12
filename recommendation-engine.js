(function () {
  const VIBE_WORDS = [
    'soul', 'neo-soul', 'r&b', 'rb', 'indie soul', 'alternative r&b', 'late night', 'intimate',
    'dreamy', 'warm', 'melancholic', 'cinematic', 'brooding', 'nocturnal', 'soft', 'slow burn',
    'romantic', 'sincere', 'grit', 'spiritual', 'midnight', 'after hours', 'beautiful', 'ash', 'vibe'
  ];

  const NOISE_PATTERNS = /(remix|cover|live|session|mix|edit|bootleg|radio|instrumental|interlude|medley|acoustic|reprise|dj)/i;
  const GENERIC_HIT_PATTERNS = /(love|baby|forever|summer|heart|nights|tonight|again|you|me|home|everything|angel|fire)/i;

  function normalizeSearchText(value = '') {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function isNoiseTrack(track = {}) {
    const title = String(track?.title || track?.track || '').trim();
    const artist = String(track?.artist?.name || track?.artist || '').trim();
    const haystack = `${title} ${artist}`;
    return NOISE_PATTERNS.test(haystack) || !title || !artist;
  }

  function buildTrackFeedbackKey(track = {}) {
    const artist = String(track?.artist || track?.artistName || '').trim();
    const title = String(track?.track || track?.title || '').trim();
    const artistKey = normalizeSearchText(artist).replace(/\s+/g, '-') || 'unknown';
    const trackKey = normalizeSearchText(title).replace(/\s+/g, '-') || 'track';
    return `${artistKey}::${trackKey}`;
  }

  function scoreTrackForVibe(track, query = '', feedback = {}) {
    const artistName = String(track?.artist?.name || track?.artist || '').trim();
    const rawTitle = String(track?.title || track?.track || '').trim();
    const albumTitle = String(track?.album?.title || '').trim();
    const input = `${artistName} ${rawTitle} ${albumTitle}`.toLowerCase();
    const normalizedArtist = normalizeSearchText(artistName);
    const normalizedQuery = normalizeSearchText(query);
    const key = buildTrackFeedbackKey({ artist: artistName, track: rawTitle });
    const rating = Number(feedback?.ratings?.[key] || 0);
    const liked = Boolean(feedback?.likes?.[key]);
    const playCount = Number(feedback?.plays?.[key]?.count || 0);
    const albumKey = normalizeSearchText(albumTitle);
    const albumPreference = Number(feedback?.albumPreferences?.[albumKey] || 0);
    let score = 0;

    if (track?.preview?.available && track?.preview?.url) {
      score += 14;
    }

    if (!isNoiseTrack(track)) {
      score += 12;
    }

    if (normalizedArtist && normalizedQuery) {
      if (normalizedArtist === normalizedQuery || normalizedArtist.includes(normalizedQuery) || normalizedQuery.includes(normalizedArtist)) {
        score += 46;
      } else {
        score += 8;
      }
    }

    if (rawTitle && rawTitle.length <= 28) {
      score += 9;
    }

    if (rawTitle && rawTitle.length > 60) {
      score -= 8;
    }

    for (const vibeWord of VIBE_WORDS) {
      if (input.includes(vibeWord)) {
        score += 8;
      }
    }

    if (/(soul|r&b|rb|neo-soul|late night|intimate|dreamy|side quest|warm|melancholic|romantic|sincere|brooding|nocturnal)/i.test(input)) {
      score += 10;
    }

    if (NOISE_PATTERNS.test(input)) {
      score -= 60;
    }

    if (GENERIC_HIT_PATTERNS.test(rawTitle) && rawTitle.split(/\s+/).length <= 3) {
      score -= 14;
    }

    if (/^(love|heart|summer|forever|alone|tonight|nights|baby|beautiful)$/i.test(rawTitle.trim())) {
      score -= 18;
    }

    if (/^\d+$/i.test(rawTitle.trim())) {
      score -= 12;
    }

    if (artistName && normalizedQuery && normalizedArtist === normalizedQuery && rawTitle && !GENERIC_HIT_PATTERNS.test(rawTitle)) {
      score += 8;
    }

    if (rating > 0) {
      score += (rating - 3) * 12;
    }

    if (liked) {
      score += 22;
    }

    score -= Math.min(playCount, 5) * 12;
    score += Math.max(-8, Math.min(8, albumPreference * 4));

    return score;
  }

  function rankTrackMatches(tracks = [], query = '', feedback = {}, options = {}) {
    const list = Array.isArray(tracks) ? tracks : [];
    const recentlySuggested = Array.isArray(options?.recentlySuggested) ? options.recentlySuggested : [];
    const knownTrackKeys = new Set(Array.isArray(options?.knownTrackKeys) ? options.knownTrackKeys : []);
    const requiredArtist = normalizeSearchText(options?.requiredArtist);
    const random = typeof options?.random === 'function' ? options.random : Math.random;

    const candidates = list
      .map((track) => {
        const artistName = String(track?.artist?.name || track?.artist || '').trim();
        if (requiredArtist && normalizeSearchText(artistName) !== requiredArtist) return null;
        const rawTitle = String(track?.title || track?.track || '').trim();
        const trackKey = buildTrackFeedbackKey({ artist: artistName, track: rawTitle });
        const recencyIndex = recentlySuggested.findIndex((key) => key === trackKey);
        const recencyPenalty = recencyIndex >= 0 ? 30 + ((recentlySuggested.length - recencyIndex) * 3) : 0;
        const known = knownTrackKeys.has(trackKey) || Number(feedback?.ratings?.[trackKey] || 0) > 0 || Boolean(feedback?.likes?.[trackKey]);
        const familiarityPenalty = known ? 100 : 0;
        const variation = (Math.max(0, Math.min(1, Number(random()) || 0)) - 0.5) * 12;
        const score = scoreTrackForVibe(track, query, feedback) - recencyPenalty - familiarityPenalty + variation;
        return { track, score };
      })
      .filter(Boolean)
      .filter(({ track, score }) => {
        const previewOk = Boolean(track?.preview?.available && track?.preview?.url);
        return previewOk && score > 0 && !isNoiseTrack(track);
      });

    const novelCandidates = candidates.filter(({ track }) => {
      const key = buildTrackFeedbackKey({ artist: track?.artist?.name || track?.artist, track: track?.title || track?.track });
      return !knownTrackKeys.has(key) && !feedback?.ratings?.[key] && !feedback?.likes?.[key] && !feedback?.plays?.[key]?.count && !recentlySuggested.includes(key);
    });
    const unplayedCandidates = candidates.filter(({ track }) => {
      const key = buildTrackFeedbackKey({ artist: track?.artist?.name || track?.artist, track: track?.title || track?.track });
      return !knownTrackKeys.has(key) && !feedback?.ratings?.[key] && !feedback?.likes?.[key] && !feedback?.plays?.[key]?.count;
    });
    const selectionPool = novelCandidates.length ? novelCandidates : (unplayedCandidates.length ? unplayedCandidates : candidates);

    return selectionPool
      .sort((a, b) => b.score - a.score || (String(a.track?.title || '').length - String(b.track?.title || '').length))
      .slice(0, 5)
      .map(({ track }) => track);
  }

  function addTrackToPlaylist(playlist, track) {
    const safePlaylist = playlist || { id: 'local-playlist', title: 'Playlist', tracks: [] };
    const targetArtist = String(track?.artist || '').trim();
    const targetTitle = String(track?.track || track?.title || '').trim();
    const trackKey = buildTrackFeedbackKey({ artist: targetArtist, track: targetTitle });

    const existing = (safePlaylist.tracks || []).find((entry) => {
      const key = buildTrackFeedbackKey({ artist: entry?.artist || '', track: entry?.track || entry?.title || '' });
      return key === trackKey;
    });

    if (existing) {
      return { added: false, playlist: safePlaylist, reason: 'already in playlist' };
    }

    safePlaylist.tracks = [...(safePlaylist.tracks || []), { artist: targetArtist, track: targetTitle, reason: '' }];
    return { added: true, playlist: safePlaylist, reason: 'added' };
  }

  const api = {
    normalizeSearchText,
    buildTrackFeedbackKey,
    rankTrackMatches,
    addTrackToPlaylist,
    scoreTrackForVibe,
    isNoiseTrack,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.SoftWavRecommendationEngine = api;
  }
})();
