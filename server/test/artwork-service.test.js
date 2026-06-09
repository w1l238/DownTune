import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fetchArtworkTags, lookupArtworkUrl } from '../services/artworkService.js';

const SAFE_URL = 'https://cdn.example.com/art.jpg';
const PRIVATE_IP_URL = 'http://192.168.1.1/art.jpg';
const LOCALHOST_URL = 'http://localhost/art.jpg';

// ── mock helpers ──────────────────────────────────────────────────────────────

const makeOkFetch = ({ mime = 'image/jpeg', body = Buffer.from('fake-jpeg') } = {}) =>
  async (_url) => ({
    ok: true,
    status: 200,
    headers: { get: (h) => h === 'content-type' ? mime : null },
    // Buffer is acceptable input to Buffer.from()
    arrayBuffer: async () => body,
  });

const makeFailFetch = (status = 403) =>
  async (_url) => ({
    ok: false,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => Buffer.alloc(0),
  });

const makeThrowFetch = () =>
  async () => { throw new Error('ECONNREFUSED'); };

const makeMockFs = (overrides = {}) => ({
  writeFile: async () => {},
  ...overrides,
});

// ── URL safety ────────────────────────────────────────────────────────────────

describe('fetchArtworkTags — URL safety', () => {
  test('returns {} for private IP URL without calling fetch', async () => {
    let fetchCalled = false;
    const result = await fetchArtworkTags(PRIVATE_IP_URL, '/tmp', '.opus', {
      fetchFn: async () => { fetchCalled = true; return makeOkFetch()(); },
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, {});
    assert.ok(!fetchCalled, 'fetch must not be called for private-IP URLs');
  });

  test('returns {} for localhost URL', async () => {
    const result = await fetchArtworkTags(LOCALHOST_URL, '/tmp', '.opus', {
      fetchFn: makeOkFetch(),
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, {});
  });

  test('returns {} for null URL', async () => {
    const result = await fetchArtworkTags(null, '/tmp', '.opus', {
      fetchFn: makeOkFetch(),
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, {});
  });

  test('returns {} for empty string URL', async () => {
    const result = await fetchArtworkTags('', '/tmp', '.mp3', {
      fetchFn: makeOkFetch(),
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, {});
  });
});

// ── cover.jpg saving ──────────────────────────────────────────────────────────

describe('fetchArtworkTags — cover.jpg', () => {
  test('saves image bytes to <targetFolderPath>/cover.jpg on success', async () => {
    let savedPath = null;
    let savedBuffer = null;
    const fakeBody = Buffer.from('image-bytes-here');

    await fetchArtworkTags(SAFE_URL, '/music/Artist/Album', '.mp3', {
      fetchFn: makeOkFetch({ body: fakeBody }),
      fsMod: makeMockFs({
        writeFile: async (p, buf) => { savedPath = p; savedBuffer = buf; },
      }),
    });

    assert.equal(savedPath, '/music/Artist/Album/cover.jpg');
    assert.ok(Buffer.isBuffer(savedBuffer) || savedBuffer instanceof Uint8Array);
  });

  test('does not throw when cover.jpg write fails (permission error)', async () => {
    await assert.doesNotReject(() =>
      fetchArtworkTags(SAFE_URL, '/read-only', '.flac', {
        fetchFn: makeOkFetch(),
        fsMod: makeMockFs({
          writeFile: async () => { throw new Error('EACCES: permission denied'); },
        }),
      })
    );
  });

  test('still returns tag additions even when cover.jpg save fails', async () => {
    const result = await fetchArtworkTags(SAFE_URL, '/read-only', '.m4a', {
      fetchFn: makeOkFetch(),
      fsMod: makeMockFs({
        writeFile: async () => { throw new Error('EROFS'); },
      }),
    });
    assert.ok('image' in result, 'image tag additions still returned after cover.jpg failure');
  });
});

// ── Opus (non-embeddable) ─────────────────────────────────────────────────────

describe('fetchArtworkTags — Opus (.opus)', () => {
  test('returns { artworkUrl } for .opus', async () => {
    const result = await fetchArtworkTags(SAFE_URL, '/tmp', '.opus', {
      fetchFn: makeOkFetch(),
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, { artworkUrl: SAFE_URL });
  });

  test('does not include image key for .opus', async () => {
    const result = await fetchArtworkTags(SAFE_URL, '/tmp', '.opus', {
      fetchFn: makeOkFetch(),
      fsMod: makeMockFs(),
    });
    assert.ok(!('image' in result), '.opus must not get an embedded image tag');
  });

  test('artworkUrl is the original URL, not the cover.jpg path', async () => {
    const result = await fetchArtworkTags(SAFE_URL, '/music/A/B', '.opus', {
      fetchFn: makeOkFetch(),
      fsMod: makeMockFs(),
    });
    assert.equal(result.artworkUrl, SAFE_URL);
  });
});

// ── embeddable formats ────────────────────────────────────────────────────────

describe('fetchArtworkTags — embeddable formats', () => {
  for (const ext of ['.mp3', '.m4a', '.flac']) {
    test(`returns { image } (not artworkUrl) for ${ext}`, async () => {
      const result = await fetchArtworkTags(SAFE_URL, '/tmp', ext, {
        fetchFn: makeOkFetch(),
        fsMod: makeMockFs(),
      });
      assert.ok('image' in result, `${ext} must get an image tag`);
      assert.ok(!('artworkUrl' in result), `${ext} must not get artworkUrl`);
    });

    test(`image.imageBuffer is a Buffer for ${ext}`, async () => {
      const fakeBody = Buffer.from('jpeg-payload');
      const result = await fetchArtworkTags(SAFE_URL, '/tmp', ext, {
        fetchFn: makeOkFetch({ body: fakeBody }),
        fsMod: makeMockFs(),
      });
      assert.ok(Buffer.isBuffer(result.image.imageBuffer));
      assert.ok(result.image.imageBuffer.length > 0);
    });

    test(`image.mime reflects Content-Type header for ${ext}`, async () => {
      const result = await fetchArtworkTags(SAFE_URL, '/tmp', ext, {
        fetchFn: makeOkFetch({ mime: 'image/png' }),
        fsMod: makeMockFs(),
      });
      assert.equal(result.image.mime, 'image/png');
    });

    test(`image.mime strips charset suffix for ${ext}`, async () => {
      const result = await fetchArtworkTags(SAFE_URL, '/tmp', ext, {
        fetchFn: makeOkFetch({ mime: 'image/jpeg; charset=utf-8' }),
        fsMod: makeMockFs(),
      });
      assert.equal(result.image.mime, 'image/jpeg');
    });

    test(`image.mime falls back to image/jpeg when header absent for ${ext}`, async () => {
      const result = await fetchArtworkTags(SAFE_URL, '/tmp', ext, {
        fetchFn: makeOkFetch({ mime: null }),
        fsMod: makeMockFs(),
      });
      assert.equal(result.image.mime, 'image/jpeg');
    });
  }
});

// ── fetch failures ────────────────────────────────────────────────────────────

describe('fetchArtworkTags — fetch failures', () => {
  test('returns {} on non-ok HTTP status (403)', async () => {
    const result = await fetchArtworkTags(SAFE_URL, '/tmp', '.opus', {
      fetchFn: makeFailFetch(403),
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, {});
  });

  test('returns {} on non-ok HTTP status (500)', async () => {
    const result = await fetchArtworkTags(SAFE_URL, '/tmp', '.mp3', {
      fetchFn: makeFailFetch(500),
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, {});
  });

  test('returns {} when fetch throws a network error', async () => {
    const result = await fetchArtworkTags(SAFE_URL, '/tmp', '.opus', {
      fetchFn: makeThrowFetch(),
      fsMod: makeMockFs(),
    });
    assert.deepEqual(result, {});
  });

  test('does not throw on fetch network error', async () => {
    await assert.doesNotReject(() =>
      fetchArtworkTags(SAFE_URL, '/tmp', '.m4a', {
        fetchFn: makeThrowFetch(),
        fsMod: makeMockFs(),
      })
    );
  });

  test('does not save cover.jpg when fetch returns non-ok', async () => {
    let writeFileCalled = false;
    await fetchArtworkTags(SAFE_URL, '/tmp', '.opus', {
      fetchFn: makeFailFetch(404),
      fsMod: makeMockFs({ writeFile: async () => { writeFileCalled = true; } }),
    });
    assert.ok(!writeFileCalled, 'cover.jpg must not be written on non-ok fetch');
  });
});

// ── iTunes lookup fallback ────────────────────────────────────────────────────

describe('lookupArtworkUrl', () => {
  test('returns high-resolution artwork URL from iTunes search result', async () => {
    let requestedUrl = '';
    const result = await lookupArtworkUrl({ artist: 'Sleep Token', title: 'Hypnosis', album: 'Tomb' }, {
      fetchFn: async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          json: async () => ({
            results: [{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/source/100x100bb.jpg' }],
          }),
        };
      },
    });
    assert.match(requestedUrl, /itunes\.apple\.com\/search/);
    assert.equal(result, 'https://is1-ssl.mzstatic.com/image/thumb/Music/source/600x600bb.jpg');
  });

  test('returns null when iTunes has no artwork', async () => {
    const result = await lookupArtworkUrl({ artist: 'A', title: 'B' }, {
      fetchFn: async () => ({ ok: true, json: async () => ({ results: [] }) }),
    });
    assert.equal(result, null);
  });

  test('returns null for unsafe lookup result URLs', async () => {
    const result = await lookupArtworkUrl({ artist: 'A', title: 'B' }, {
      fetchFn: async () => ({
        ok: true,
        json: async () => ({ results: [{ artworkUrl100: 'http://localhost/100x100bb.jpg' }] }),
      }),
    });
    assert.equal(result, null);
  });

  test('returns null without calling fetch when query is empty', async () => {
    let fetchCalled = false;
    const result = await lookupArtworkUrl({}, {
      fetchFn: async () => { fetchCalled = true; throw new Error('should not fetch'); },
    });
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });
});
