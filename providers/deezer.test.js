const test = require('node:test');
const assert = require('node:assert/strict');

const { DeezerProvider } = require('./deezer');

test('DeezerProvider omits known generic artist placeholder portraits', () => {
  const provider = new DeezerProvider();
  const placeholderIds = [
    '96bc2f8cbab605ff6f5bb37e0e383758',
    '7b99cdeef28f36ff15d77e6670225e60',
    'd41d8cd98f00b204e9800998ecf8427e',
    '43ceb1d48e2184a4b2ccbcf2f6a03152',
  ];

  placeholderIds.forEach((imageId) => {
    const artist = provider.normalizeArtist({
      id: '1',
      name: 'Test Artist',
      picture_big: `https://cdn-images.dzcdn.net/images/artist/${imageId}/500x500.jpg`,
    });
    assert.equal(artist.picture, '');
  });
});

test('DeezerProvider preserves real artist portraits', () => {
  const provider = new DeezerProvider();
  const portrait = 'https://cdn-images.dzcdn.net/images/artist/973809864ad1c52d8c61238662400089/500x500.jpg';

  assert.equal(provider.normalizeArtist({ name: 'Daniel Caesar', picture_big: portrait }).picture, portrait);
});

test('DeezerProvider retries transient upstream failures before succeeding', async () => {
  const provider = new DeezerProvider({ baseUrl: 'https://example.com', timeoutMs: 5000 });
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push(String(url));

    if (calls.length < 3) {
      const error = new Error('temporary service issue');
      error.status = 503;
      throw error;
    }

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: [
            {
              id: 1,
              title: 'Sample Song',
              artist: { id: 7, name: 'Sample Artist', link: 'https://deezer.com/artist/7' },
              album: { id: 2, title: 'Sample Album', cover_medium: 'https://img.example/cover.jpg', link: 'https://deezer.com/album/2' },
              link: 'https://deezer.com/track/1',
              preview: 'https://example.com/preview.mp3',
              duration: 120,
            },
          ],
        });
      },
    };
  };

  try {
    const result = await provider.searchTracks('sample', 5);
    assert.equal(result.total, 1);
    assert.equal(result.results[0].title, 'Sample Song');
    assert.equal(calls.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});
