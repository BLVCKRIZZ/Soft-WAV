const DEFAULT_DEEZER_API_BASE = 'https://api.deezer.com';
const PLACEHOLDER_ARTIST_IMAGE_IDS = new Set([
  '96bc2f8cbab605ff6f5bb37e0e383758',
  '7b99cdeef28f36ff15d77e6670225e60',
  'd41d8cd98f00b204e9800998ecf8427e',
  '43ceb1d48e2184a4b2ccbcf2f6a03152',
]);

class DeezerProvider {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.DEEZER_API_BASE || DEFAULT_DEEZER_API_BASE;
    this.timeoutMs = Number(config.timeoutMs || 15000);
    this.maxRetries = Number(config.maxRetries || 3);
  }

  buildUrl(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  async request(path, params = {}) {
    const url = this.buildUrl(path, params);
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'SoftWAV/1.0',
          },
          signal: controller.signal,
        });

        const text = await response.text();
        let payload = {};

        if (text) {
          try {
            payload = JSON.parse(text);
          } catch (error) {
            payload = { raw: text };
          }
        }

        if (!response.ok) {
          const status = Number(response.status || 0);
          const retryable = [408, 429, 500, 502, 503, 504].includes(status);
          const message = payload?.error?.message || `Deezer request failed (${response.status})`;
          lastError = new Error(message);
          lastError.status = response.status;
          lastError.payload = payload;

          if (retryable && attempt < this.maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
            continue;
          }

          throw lastError;
        }

        return payload;
      } catch (error) {
        lastError = error;

        const status = Number(error?.status || 0);
        const retryable = status === 429 || status === 503 || status === 504 || !status || error?.name === 'AbortError';

        if (retryable && attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          continue;
        }

        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastError) {
      const retryMessage = 'Deezer catalog is temporarily unavailable. Try searching again in a moment.';
      lastError.message = retryMessage;
      throw lastError;
    }

    throw new Error('Deezer catalog is temporarily unavailable. Try searching again in a moment.');
  }

  normalizeArtist(artist = {}) {
    if (!artist || typeof artist !== 'object') {
      return {
        id: null,
        name: 'Deezer artist',
        link: '',
        picture: '',
      };
    }

    const picture = artist.picture_big || artist.picture_medium || artist.picture_small || artist.picture || '';
    const imageId = picture.match(/\/images\/artist\/([^/]+)\//)?.[1] || '';

    return {
      id: artist.id ? String(artist.id) : null,
      name: artist.name || 'Deezer artist',
      link: artist.link || '',
      picture: PLACEHOLDER_ARTIST_IMAGE_IDS.has(imageId) ? '' : picture,
    };
  }

  normalizeAlbum(album = {}) {
    if (!album || typeof album !== 'object') {
      return {
        id: null,
        title: 'Deezer album',
        cover: '',
        link: '',
      };
    }

    return {
      id: album.id ? String(album.id) : null,
      title: album.title || 'Deezer album',
      cover: album.cover_medium || album.cover_big || album.cover_small || album.cover || '',
      link: album.link || '',
    };
  }

  normalizeTrack(track = {}) {
    const previewUrl = typeof track.preview === 'string' && track.preview.trim() ? track.preview.trim() : null;

    return {
      id: track.id ? String(track.id) : null,
      title: track.title || 'Untitled track',
      artist: this.normalizeArtist(track.artist),
      album: this.normalizeAlbum(track.album),
      duration: Number(track.duration) || 0,
      explicit: Boolean(track.explicit_lyrics),
      preview: {
        available: Boolean(previewUrl),
        url: previewUrl,
      },
      provider: 'deezer',
      link: track.link || '',
      deezerUrl: track.link || '',
      artwork: track.album?.cover_medium || track.album?.cover_big || track.album?.cover_small || track.album?.cover || '',
      genre: track.genre || null,
      releaseDate: track.release_date || null,
    };
  }

  async searchTracks(query, limit = 5) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) {
      return { query: cleanQuery, total: 0, results: [] };
    }

    const payload = await this.request('/search/track', {
      q: cleanQuery,
      limit,
    });

    const results = Array.isArray(payload?.data) ? payload.data.map((track) => this.normalizeTrack(track)) : [];

    return {
      query: cleanQuery,
      total: results.length,
      results,
    };
  }

  async searchArtists(query, limit = 5) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) {
      return { query: cleanQuery, total: 0, results: [] };
    }

    const payload = await this.request('/search/artist', {
      q: cleanQuery,
      limit,
    });

    const results = Array.isArray(payload?.data) ? payload.data.map((artist) => this.normalizeArtist(artist)) : [];

    return {
      query: cleanQuery,
      total: results.length,
      results,
    };
  }

  async getTrack(trackId) {
    if (!trackId) {
      throw new Error('A Deezer track id is required.');
    }

    const payload = await this.request(`/track/${encodeURIComponent(trackId)}`);
    return this.normalizeTrack(payload);
  }

  async getArtist(artistId) {
    if (!artistId) {
      throw new Error('A Deezer artist id is required.');
    }

    const payload = await this.request(`/artist/${encodeURIComponent(artistId)}`);
    return this.normalizeArtist(payload);
  }

  async getAlbum(albumId) {
    if (!albumId) {
      throw new Error('A Deezer album id is required.');
    }

    const payload = await this.request(`/album/${encodeURIComponent(albumId)}`);
    return this.normalizeAlbum(payload);
  }
}

const deezerProvider = new DeezerProvider();

module.exports = {
  DeezerProvider,
  deezerProvider,
};
