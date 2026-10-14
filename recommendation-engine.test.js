const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rankTrackMatches,
  addTrackToPlaylist,
  buildTrackFeedbackKey,
  findExactDeezerTrackMatch,
} = require('./recommendation-engine.js');

test('findExactDeezerTrackMatch requires both the artist and title to match', () => {
  const deezerTracks = [
    { title: 'MUTT', artist: { name: 'Leon Thomas' }, provider: 'deezer' },
    { title: 'MUTT', artist: { name: 'Another Artist' }, provider: 'deezer' },
    { title: 'MUTT Remix', artist: { name: 'Leon Thomas' }, provider: 'deezer' },
  ];

  assert.equal(findExactDeezerTrackMatch({ artist: 'Leon Thomas', track: 'Mutt' }, deezerTracks), deezerTracks[0]);
  assert.equal(findExactDeezerTrackMatch({ artist: 'Leon Thomas', track: 'Mutt Live' }, deezerTracks), null);
  assert.equal(findExactDeezerTrackMatch({ artist: 'Leon Thomas Jr.', track: 'Mutt' }, deezerTracks), null);
});

test('rankTrackMatches favors vibe-fit deep cuts before obvious radio hits', () => {
  const tracks = [
    { title: 'Love', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/1' } },
    { title: 'MUTT', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/2' } },
    { title: 'My Muse', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/3' } },
    { title: 'MUTT (CB REMIX)', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/4' } },
  ];

  const ranked = rankTrackMatches(tracks, 'Leon Thomas');
  assert.ok(ranked[0].title === 'MUTT' || ranked[0].title === 'My Muse');
  assert.ok(!ranked.some((track) => track.title === 'MUTT (CB REMIX)'));
  assert.ok(ranked.length <= 5);
});

test('rankTrackMatches rotates recently suggested tracks out of the top results', () => {
  const tracks = [
    { title: 'Midnight Drive', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/1' } },
    { title: 'Quiet Thing', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/2' } },
    { title: 'Afterglow', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/3' } },
    { title: 'Late Bloom', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/4' } },
  ];

  const ranked = rankTrackMatches(tracks, 'Leon Thomas', {}, { recentlySuggested: ['leon-thomas::midnight-drive', 'leon-thomas::quiet-thing'] });

  assert.ok(ranked.slice(0, 2).every((track) => !['Midnight Drive', 'Quiet Thing'].includes(track.title)));
  assert.ok(ranked.length <= 5);
});

test('rankTrackMatches pushes known tracks down even when they are liked', () => {
  const tracks = [
    { title: 'Velvet Rain', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/1' } },
    { title: 'Velvet Days', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/2' } },
  ];
  const knownKey = buildTrackFeedbackKey({ artist: 'Leon Thomas', track: 'Velvet Rain' });

  const ranked = rankTrackMatches(tracks, 'Leon Thomas', {
    likes: { [knownKey]: true },
    ratings: { [knownKey]: 5 },
  }, { knownTrackKeys: [knownKey], random: () => 0.5 });

  assert.equal(ranked[0].title, 'Velvet Days');
});

test('rankTrackMatches varies equally scored suggestions between searches', () => {
  const tracks = [
    { title: 'Velvet Rain', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/1' } },
    { title: 'Velvet Days', artist: { name: 'Leon Thomas' }, preview: { available: true, url: 'https://example.com/2' } },
  ];

  const rankWithRandomSequence = (values) => {
    let index = 0;
    return rankTrackMatches(tracks, 'Leon Thomas', {}, { random: () => values[index++] });
  };
  const firstOrder = rankWithRandomSequence([0, 1]);
  const secondOrder = rankWithRandomSequence([1, 0]);

  assert.notDeepEqual(firstOrder.map((track) => track.title), secondOrder.map((track) => track.title));
});

test('rankTrackMatches learns album preference from feedback on another track', () => {
  const tracks = [
    { title: 'Quiet Window', artist: { name: 'Leon Thomas' }, album: { title: 'Warm Room' }, preview: { available: true, url: 'https://example.com/1' } },
    { title: 'Quiet Window', artist: { name: 'Leon Thomas' }, album: { title: 'Cold Street' }, preview: { available: true, url: 'https://example.com/2' } },
  ];

  const ranked = rankTrackMatches(tracks, 'Leon Thomas', {
    albumPreferences: { 'warm room': 2 },
  }, { random: () => 0.5 });

  assert.equal(ranked[0].album.title, 'Warm Room');
});

test('rankTrackMatches excludes unrelated artists from an artist profile search', () => {
  const tracks = [
    { title: 'Switch', artist: { name: '6LACK' }, preview: { available: true, url: 'https://example.com/1' } },
    { title: "Tell Me It's Over", artist: { name: 'Jacquees' }, preview: { available: true, url: 'https://example.com/2' } },
  ];

  const ranked = rankTrackMatches(tracks, '6LACK', {}, { requiredArtist: '6LACK', random: () => 0.5 });

  assert.deepEqual(ranked.map(track => track.artist.name), ['6LACK']);
});

test('addTrackToPlaylist rejects duplicates and accepts new songs', () => {
  const playlist = {
    id: 'p1',
    title: 'Late Night',
    tracks: [{ artist: 'Leon Thomas', track: 'My Muse' }],
  };

  const duplicate = addTrackToPlaylist(playlist, { artist: 'Leon Thomas', track: 'My Muse' });
  const added = addTrackToPlaylist(playlist, { artist: 'Leon Thomas', track: 'MUTT' });

  assert.equal(duplicate.added, false);
  assert.equal(added.added, true);
  assert.equal(playlist.tracks.length, 2);
  assert.equal(buildTrackFeedbackKey({ artist: 'Leon Thomas', track: 'My Muse' }), 'leon-thomas::my-muse');
});
