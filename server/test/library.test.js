import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { unlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import { toggleFavorite, bulkLike, extractComment, extractLyrics, getNativeTagValue, probeDuration } from '../libraryManager.js';

describe('library metadata normalization', () => {
  test('extractComment reads MP3/ID3-style common comment objects', () => {
    const metadata = {
      common: { comment: [{ language: 'eng', text: 'ID3 comment' }] },
      native: {},
    };
    assert.equal(extractComment(metadata), 'ID3 comment');
  });

  test('extractComment reads M4A common comment objects', () => {
    const metadata = {
      common: { comment: [{ text: 'M4A comment' }] },
      native: {},
    };
    assert.equal(extractComment(metadata), 'M4A comment');
  });

  test('extractComment falls back to Opus/FLAC native Vorbis DESCRIPTION', () => {
    for (const format of ['opus', 'flac']) {
      const metadata = {
        common: {},
        native: {
          vorbis: [
            { id: 'TITLE', value: 'Take Me Back To Eden' },
            { id: 'DESCRIPTION', value: `${format} comment` },
          ],
        },
      };
      assert.equal(extractComment(metadata), `${format} comment`);
    }
  });

  test('extractLyrics reads common lyrics and native Vorbis LYRICS fallback', () => {
    assert.equal(
      extractLyrics({ common: { lyrics: [{ text: 'common lyrics' }] }, native: {} }),
      'common lyrics'
    );
    assert.equal(
      extractLyrics({ common: {}, native: { vorbis: [{ id: 'LYRICS', value: 'vorbis lyrics' }] } }),
      'vorbis lyrics'
    );
  });
});

describe('toggleFavorite', () => {
  test('adds an id that is not favorited', async () => {
    const result = await toggleFavorite('test-song-add');
    assert.equal(result, true);
    // clean up
    await toggleFavorite('test-song-add');
  });

  test('removes an id that is already favorited', async () => {
    await toggleFavorite('test-song-remove');
    const result = await toggleFavorite('test-song-remove');
    assert.equal(result, false);
  });
});

describe('bulkLike', () => {
  test('adds multiple ids when shouldLike is true', async () => {
    await bulkLike(['bulk-a', 'bulk-b'], true);
    // toggling a liked id should remove it (returns false)
    const r = await toggleFavorite('bulk-a');
    assert.equal(r, false);
    await toggleFavorite('bulk-b');
  });

  test('removes multiple ids when shouldLike is false', async () => {
    await bulkLike(['bulk-c', 'bulk-d'], true);
    await bulkLike(['bulk-c', 'bulk-d'], false);
    // toggling an unliked id should add it (returns true)
    const r = await toggleFavorite('bulk-c');
    assert.equal(r, true);
    await toggleFavorite('bulk-c');
    await toggleFavorite('bulk-d');
  });
});

// ── getNativeTagValue — ARTWORK_URL extraction ───────────────────────────────

describe('getNativeTagValue — ARTWORK_URL extraction', () => {
  test('reads ARTWORK_URL from Opus/Vorbis native tags', () => {
    const metadata = {
      native: {
        vorbis: [
          { id: 'TITLE', value: 'Track Title' },
          { id: 'ARTWORK_URL', value: 'https://example.com/cover.jpg' },
        ],
      },
    };
    assert.equal(getNativeTagValue(metadata, ['ARTWORK_URL']), 'https://example.com/cover.jpg');
  });

  test('returns null when ARTWORK_URL is absent', () => {
    const metadata = {
      native: { vorbis: [{ id: 'TITLE', value: 'Track' }] },
    };
    assert.equal(getNativeTagValue(metadata, ['ARTWORK_URL']), null);
  });

  test('matches tag names case-insensitively', () => {
    const metadata = {
      native: {
        vorbis: [{ id: 'artwork_url', value: 'https://cdn.example/art.jpg' }],
      },
    };
    assert.equal(getNativeTagValue(metadata, ['ARTWORK_URL']), 'https://cdn.example/art.jpg');
  });
});

// ── probeDuration ────────────────────────────────────────────────────────────

// Detect ffmpeg once at module load so individual tests can skip cleanly.
const ffmpegAvailable = (() => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

describe('probeDuration', () => {
  test('returns 0 for a nonexistent file', async () => {
    const dur = await probeDuration('/nonexistent-downtune-test-path/song.opus');
    assert.equal(dur, 0);
  });

  test(
    'returns positive duration for a generated 2-second silent MP3',
    { skip: !ffmpegAvailable },
    async () => {
      const outPath = path.join(os.tmpdir(), `downtune-probe-${process.pid}.mp3`);
      try {
        execFileSync('ffmpeg', [
          '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
          '-t', '2', '-q:a', '9', outPath,
        ], { stdio: 'ignore' });
        const dur = await probeDuration(outPath);
        assert.ok(dur > 0, `expected positive duration, got ${dur}`);
        assert.ok(dur < 5, `expected duration < 5 s, got ${dur}`);
      } finally {
        try { unlinkSync(outPath); } catch { /* ignore cleanup failure */ }
      }
    },
  );
});
