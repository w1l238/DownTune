import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFfmpegMetadataArgs,
  buildFfmpegArgs,
  supportsArtworkEmbedding,
  AudioMetadataWriter,
} from '../services/AudioMetadataWriter.js';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Turn ['-metadata', 'k=v', ...] into { k: 'v', ... } for easy assertions */
const parseMetaPairs = (args) => {
  const map = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-metadata' && i + 1 < args.length) {
      const [k, ...rest] = args[i + 1].split('=');
      map[k] = rest.join('=');
    }
  }
  return map;
};

const makeMockNodeId3 = (overrides = {}) => ({
  Promise: {
    write: async () => true,
    update: async () => true,
    ...overrides,
  },
});

const makeMockFs = (overrides = {}) => ({
  writeFile: async () => {},
  rename: async () => {},
  unlink: async () => {},
  ...overrides,
});

const makeMockExecFile = (shouldFail = false, errorMsg = 'ffmpeg error') =>
  shouldFail
    ? async () => { throw new Error(errorMsg); }
    : async () => ({ stdout: '', stderr: '' });

// ── buildFfmpegMetadataArgs ──────────────────────────────────────────────────

describe('buildFfmpegMetadataArgs', () => {
  test('includes all non-empty fields from a full tag set', () => {
    const tags = {
      title: 'Song Title',
      artist: 'Artist Name',
      album: 'Album Name',
      year: '2023',
      trackNumber: '5',
      partOfSet: '1',
      genre: 'Rock',
      comment: { language: 'eng', text: 'A comment' },
      unsynchronisedLyrics: { language: 'eng', text: 'Some lyrics' },
    };
    const meta = parseMetaPairs(buildFfmpegMetadataArgs(tags));
    assert.equal(meta.title, 'Song Title');
    assert.equal(meta.artist, 'Artist Name');
    assert.equal(meta.album, 'Album Name');
    assert.equal(meta.date, '2023');
    assert.equal(meta.track, '5');
    assert.equal(meta.disc, '1');
    assert.equal(meta.genre, 'Rock');
    assert.equal(meta.comment, 'A comment');
    assert.equal(meta.lyrics, 'Some lyrics');
  });

  test('prefers releaseTime > date > year for the date field', () => {
    const a = parseMetaPairs(buildFfmpegMetadataArgs({ releaseTime: '2020-06-15', date: '2020', year: '2019' }));
    assert.equal(a.date, '2020-06-15');

    const b = parseMetaPairs(buildFfmpegMetadataArgs({ date: '2021-01-01', year: '2019' }));
    assert.equal(b.date, '2021-01-01');

    const c = parseMetaPairs(buildFfmpegMetadataArgs({ year: '2022' }));
    assert.equal(c.date, '2022');
  });

  test('omits fields that are null or undefined', () => {
    const args = buildFfmpegMetadataArgs({ title: 'Only Title', artist: null, album: undefined });
    assert.ok(args.some(a => a === 'title=Only Title'));
    assert.ok(!args.some(a => a.startsWith('artist=')));
    assert.ok(!args.some(a => a.startsWith('album=')));
  });

  test('omits fields that are empty strings after trim', () => {
    const args = buildFfmpegMetadataArgs({ title: '   ', artist: 'Present' });
    assert.ok(!args.some(a => a.startsWith('title=')));
    assert.ok(args.some(a => a === 'artist=Present'));
  });

  test('handles plain-string comment (not object)', () => {
    const args = buildFfmpegMetadataArgs({ comment: 'plain comment' });
    assert.ok(args.some(a => a === 'comment=plain comment'));
  });

  test('handles plain-string lyrics field', () => {
    const args = buildFfmpegMetadataArgs({ lyrics: 'plain lyrics' });
    assert.ok(args.some(a => a === 'lyrics=plain lyrics'));
  });

  test('uses discNumber when partOfSet is absent', () => {
    const args = buildFfmpegMetadataArgs({ discNumber: '2' });
    assert.ok(args.some(a => a === 'disc=2'));
  });

  test('uses partOfSet over discNumber when both present', () => {
    const args = buildFfmpegMetadataArgs({ partOfSet: '3', discNumber: '1' });
    assert.ok(args.some(a => a === 'disc=3'));
  });

  test('returns empty array for an empty tags object', () => {
    assert.deepEqual(buildFfmpegMetadataArgs({}), []);
  });

  test('includes ARTWORK_URL when artworkUrl is set', () => {
    const args = buildFfmpegMetadataArgs({ artworkUrl: 'https://cdn.example.com/art.jpg' });
    assert.ok(args.some(a => a === 'ARTWORK_URL=https://cdn.example.com/art.jpg'));
  });

  test('omits ARTWORK_URL when artworkUrl is absent', () => {
    const args = buildFfmpegMetadataArgs({ title: 'T' });
    assert.ok(!args.some(a => a.startsWith('ARTWORK_URL=')));
  });

  test('returns flat array of alternating -metadata / key=value', () => {
    const args = buildFfmpegMetadataArgs({ title: 'T', artist: 'A' });
    for (let i = 0; i < args.length; i += 2) {
      assert.equal(args[i], '-metadata');
      assert.ok(args[i + 1].includes('='));
    }
  });
});

// ── buildFfmpegArgs ──────────────────────────────────────────────────────────

describe('buildFfmpegArgs', () => {
  const input  = '/music/song.m4a';
  const output = '/music/.tmp-song.m4a';
  const tags   = { title: 'T', artist: 'A', album: 'B' };

  test('starts with -y -i <inputPath>', () => {
    const args = buildFfmpegArgs(input, output, tags, null);
    assert.equal(args[0], '-y');
    assert.equal(args[1], '-i');
    assert.equal(args[2], input);
  });

  test('ends with outputPath', () => {
    const args = buildFfmpegArgs(input, output, tags, null);
    assert.equal(args[args.length - 1], output);
  });

  test('maps audio stream and copies codec when no artwork', () => {
    const args = buildFfmpegArgs(input, output, tags, null);
    assert.ok(args.includes('0:a'));
    assert.ok(args.includes('-c:a'));
    assert.ok(args.includes('copy'));
    assert.ok(!args.includes('1:v'));
  });

  test('strips metadata with -map_metadata -1', () => {
    const args = buildFfmpegArgs(input, output, tags, null);
    const idx = args.indexOf('-map_metadata');
    assert.ok(idx !== -1);
    assert.equal(args[idx + 1], '-1');
  });

  test('includes -metadata args for non-empty tag fields', () => {
    const args = buildFfmpegArgs(input, output, tags, null);
    assert.ok(args.includes('-metadata'));
    assert.ok(args.some(a => a === 'title=T'));
    assert.ok(args.some(a => a === 'artist=A'));
    assert.ok(args.some(a => a === 'album=B'));
  });

  test('adds artwork as second -i and maps 1:v with disposition when artworkPath given', () => {
    const artwork = '/tmp/cover.jpg';
    const args = buildFfmpegArgs(input, output, tags, artwork);
    // Artwork is the second -i
    assert.equal(args[3], '-i');
    assert.equal(args[4], artwork);
    // Both streams mapped
    assert.ok(args.includes('0:a'));
    assert.ok(args.includes('1:v'));
    // Video codec copy + attached_pic disposition
    assert.ok(args.includes('-c:v'));
    assert.ok(args.includes('-disposition:v:0'));
    assert.ok(args.includes('attached_pic'));
  });

  test('opus: produces valid arg list without artwork', () => {
    const args = buildFfmpegArgs('/music/song.opus', '/music/.tmp.opus', tags, null);
    assert.equal(args[args.length - 1], '/music/.tmp.opus');
    assert.ok(args.includes('-map_metadata'));
    assert.ok(args.includes('-c:a'));
  });

  test('flac: produces valid arg list without artwork', () => {
    const args = buildFfmpegArgs('/music/song.flac', '/music/.tmp.flac', tags, null);
    assert.equal(args[args.length - 1], '/music/.tmp.flac');
    assert.ok(args.includes('-map_metadata'));
    assert.ok(args.includes('-c:a'));
  });

  test('opus with artwork path: does not include 1:v, -c:v, attached_pic, or artwork input', () => {
    const artwork = '/tmp/cover.jpg';
    const args = buildFfmpegArgs('/music/song.opus', '/music/.tmp.opus', tags, artwork);
    assert.ok(!args.includes(artwork), 'artwork path must not appear in opus args');
    assert.ok(!args.includes('1:v'), 'no video stream map for opus');
    assert.ok(!args.includes('-c:v'), 'no video codec flag for opus');
    assert.ok(!args.includes('attached_pic'), 'no attached_pic disposition for opus');
    // Text metadata and audio stream must still be present
    assert.ok(args.includes('0:a'), 'audio stream mapped');
    assert.ok(args.some(a => a === 'title=T'), 'title metadata present');
  });

  test('m4a with artwork path: still includes 1:v, -c:v, attached_pic', () => {
    const artwork = '/tmp/cover.jpg';
    const args = buildFfmpegArgs('/music/song.m4a', '/music/.tmp.m4a', tags, artwork);
    assert.ok(args.includes(artwork), 'artwork path in m4a args');
    assert.ok(args.includes('1:v'), 'video stream mapped for m4a');
    assert.ok(args.includes('-c:v'), 'video codec flag for m4a');
    assert.ok(args.includes('attached_pic'), 'attached_pic for m4a');
  });

  test('flac with artwork path: still includes 1:v, -c:v, attached_pic', () => {
    const artwork = '/tmp/cover.jpg';
    const args = buildFfmpegArgs('/music/song.flac', '/music/.tmp.flac', tags, artwork);
    assert.ok(args.includes(artwork), 'artwork path in flac args');
    assert.ok(args.includes('1:v'), 'video stream mapped for flac');
    assert.ok(args.includes('attached_pic'), 'attached_pic for flac');
  });
});

// ── supportsArtworkEmbedding ──────────────────────────────────────────────────

describe('supportsArtworkEmbedding', () => {
  test('returns false for .opus', () => {
    assert.equal(supportsArtworkEmbedding('.opus'), false);
  });

  test('returns true for .m4a', () => {
    assert.equal(supportsArtworkEmbedding('.m4a'), true);
  });

  test('returns true for .flac', () => {
    assert.equal(supportsArtworkEmbedding('.flac'), true);
  });

  test('returns true for .mp3', () => {
    assert.equal(supportsArtworkEmbedding('.mp3'), true);
  });
});

// ── AudioMetadataWriter — MP3 paths ──────────────────────────────────────────

describe('AudioMetadataWriter.writeAudioMetadata — MP3', () => {
  test('calls NodeID3.write (not execFile) for .mp3', async () => {
    let writeCalled = false;
    let writeArgs = null;
    let execCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3({
        write: async (tags, p) => { writeCalled = true; writeArgs = { tags, p }; return true; },
      }),
      execFileFn: async () => { execCalled = true; return {}; },
      fsMod: makeMockFs(),
    });
    await writer.writeAudioMetadata('/music/song.mp3', { title: 'Eden' });
    assert.ok(writeCalled);
    assert.equal(writeArgs.p, '/music/song.mp3');
    assert.deepEqual(writeArgs.tags, { title: 'Eden' });
    assert.ok(!execCalled);
  });
});

describe('AudioMetadataWriter.updateAudioMetadata — MP3', () => {
  test('calls NodeID3.update (not execFile) for .mp3', async () => {
    let updateCalled = false;
    let execCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3({
        update: async () => { updateCalled = true; return true; },
      }),
      execFileFn: async () => { execCalled = true; return {}; },
      fsMod: makeMockFs(),
    });
    await writer.updateAudioMetadata('/music/song.mp3', { title: 'Updated' });
    assert.ok(updateCalled);
    assert.ok(!execCalled);
  });
});

// ── AudioMetadataWriter — M4A ─────────────────────────────────────────────────

describe('AudioMetadataWriter.writeAudioMetadata — M4A', () => {
  test('calls ffmpeg (not NodeID3) for .m4a', async () => {
    let execCalled = false;
    let writeCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3({ write: async () => { writeCalled = true; } }),
      execFileFn: async () => { execCalled = true; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.m4a', { title: 'T' });
    assert.ok(execCalled);
    assert.ok(!writeCalled);
  });

  test('passes "ffmpeg" as the binary', async () => {
    let bin = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async (b) => { bin = b; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.m4a', { title: 'T' });
    assert.equal(bin, 'ffmpeg');
  });

  test('builds args with all metadata fields for .m4a', async () => {
    let capturedArgs = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async (_b, args) => { capturedArgs = args; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.m4a', {
      title: 'Take Me Back To Eden',
      artist: 'Sleep Token',
      album: 'Take Me Back To Eden',
      year: '2023',
      trackNumber: '9',
      partOfSet: '1',
      genre: 'Post-Metal',
      comment: { language: 'eng', text: 'a note' },
      unsynchronisedLyrics: { language: 'eng', text: 'verse one\nverse two' },
    });
    const meta = parseMetaPairs(capturedArgs);
    assert.equal(meta.title, 'Take Me Back To Eden');
    assert.equal(meta.artist, 'Sleep Token');
    assert.equal(meta.album, 'Take Me Back To Eden');
    assert.equal(meta.date, '2023');
    assert.equal(meta.track, '9');
    assert.equal(meta.disc, '1');
    assert.equal(meta.genre, 'Post-Metal');
    assert.equal(meta.comment, 'a note');
    assert.equal(meta.lyrics, 'verse one\nverse two');
  });

  test('performs atomic rename after ffmpeg succeeds', async () => {
    let renameFrom = null;
    let renameTo = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: makeMockExecFile(),
      fsMod: makeMockFs({
        rename: async (from, to) => { renameFrom = from; renameTo = to; },
      }),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/Artist/Album/song.m4a', { title: 'T' });
    assert.equal(renameTo, '/music/Artist/Album/song.m4a');
    assert.ok(renameFrom.startsWith('/music/Artist/Album/'));
    assert.ok(renameFrom.includes('.downtune-meta-'));
    assert.ok(renameFrom.endsWith('.m4a'));
  });
});

// ── AudioMetadataWriter — Opus ────────────────────────────────────────────────

describe('AudioMetadataWriter.writeAudioMetadata — Opus', () => {
  test('calls ffmpeg for .opus', async () => {
    let execCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async () => { execCalled = true; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.opus', { title: 'T', artist: 'A' });
    assert.ok(execCalled);
  });

  test('builds ffmpeg args with all metadata fields for .opus', async () => {
    let capturedArgs = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async (_b, args) => { capturedArgs = args; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.opus', {
      title: 'T', artist: 'A', album: 'B', year: '2022',
      trackNumber: '2', genre: 'Rock',
      comment: { language: 'eng', text: 'note' },
      unsynchronisedLyrics: { language: 'eng', text: 'words' },
    });
    assert.ok(capturedArgs.some(a => a === 'title=T'));
    assert.ok(capturedArgs.some(a => a === 'artist=A'));
    assert.ok(capturedArgs.some(a => a === 'album=B'));
    assert.ok(capturedArgs.some(a => a === 'date=2022'));
    assert.ok(capturedArgs.some(a => a === 'track=2'));
    assert.ok(capturedArgs.some(a => a === 'genre=Rock'));
    assert.ok(capturedArgs.some(a => a === 'comment=note'));
    assert.ok(capturedArgs.some(a => a === 'lyrics=words'));
  });

  test('writeAudioMetadata for .opus with image does not write artwork temp file', async () => {
    let writeFileCalled = false;
    let capturedArgs = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async (_b, args) => { capturedArgs = args; return {}; },
      fsMod: makeMockFs({ writeFile: async () => { writeFileCalled = true; } }),
      tmpDir: '/tmp',
    });
    const tags = {
      title: 'Opus Track',
      artist: 'Opus Artist',
      album: 'Opus Album',
      image: { mime: 'image/jpeg', imageBuffer: Buffer.from('fake-jpeg') },
    };
    await writer.writeAudioMetadata('/music/song.opus', tags);
    assert.ok(!writeFileCalled, 'no artwork temp file written for opus');
    assert.ok(capturedArgs.some(a => a === 'title=Opus Track'), 'title metadata present');
    assert.ok(capturedArgs.some(a => a === 'artist=Opus Artist'), 'artist metadata present');
    assert.ok(capturedArgs.some(a => a === 'album=Opus Album'), 'album metadata present');
    assert.ok(!capturedArgs.includes('1:v'), 'no video stream in opus ffmpeg args');
    assert.ok(!capturedArgs.includes('attached_pic'), 'no attached_pic in opus ffmpeg args');
  });
});

describe('AudioMetadataWriter.updateAudioMetadata — Opus', () => {
  test('calls ffmpeg for .opus update', async () => {
    let execCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async () => { execCalled = true; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.updateAudioMetadata('/music/song.opus', { title: 'Updated' });
    assert.ok(execCalled);
  });
});

// ── AudioMetadataWriter — FLAC ────────────────────────────────────────────────

describe('AudioMetadataWriter.writeAudioMetadata — FLAC', () => {
  test('calls ffmpeg for .flac', async () => {
    let execCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async () => { execCalled = true; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.flac', { title: 'T', artist: 'A' });
    assert.ok(execCalled);
  });

  test('builds ffmpeg args with all metadata fields for .flac', async () => {
    let capturedArgs = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async (_b, args) => { capturedArgs = args; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.flac', {
      title: 'T', artist: 'A', album: 'B', year: '2022',
      trackNumber: '2', genre: 'Rock',
      comment: { language: 'eng', text: 'note' },
      unsynchronisedLyrics: { language: 'eng', text: 'words' },
    });
    assert.ok(capturedArgs.some(a => a === 'title=T'));
    assert.ok(capturedArgs.some(a => a === 'artist=A'));
    assert.ok(capturedArgs.some(a => a === 'album=B'));
    assert.ok(capturedArgs.some(a => a === 'date=2022'));
    assert.ok(capturedArgs.some(a => a === 'track=2'));
    assert.ok(capturedArgs.some(a => a === 'genre=Rock'));
    assert.ok(capturedArgs.some(a => a === 'comment=note'));
    assert.ok(capturedArgs.some(a => a === 'lyrics=words'));
  });
});

describe('AudioMetadataWriter.updateAudioMetadata — FLAC', () => {
  test('calls ffmpeg for .flac update', async () => {
    let execCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async () => { execCalled = true; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.updateAudioMetadata('/music/song.flac', { title: 'Updated' });
    assert.ok(execCalled);
  });
});

// ── failure / safety behavior ─────────────────────────────────────────────────

describe('AudioMetadataWriter — ffmpeg failure handling', () => {
  test('ffmpeg failure does not call rename (original untouched)', async () => {
    let renameCalled = false;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: makeMockExecFile(true, 'ffmpeg: codec not found'),
      fsMod: makeMockFs({ rename: async () => { renameCalled = true; } }),
      tmpDir: '/tmp',
    });
    await assert.rejects(
      () => writer.writeAudioMetadata('/music/song.m4a', { title: 'T' }),
      /ffmpeg: codec not found/,
    );
    assert.ok(!renameCalled);
  });

  test('ffmpeg failure triggers cleanup of tmpOutput', async () => {
    const unlinkCalls = [];
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: makeMockExecFile(true),
      fsMod: makeMockFs({ unlink: async (p) => { unlinkCalls.push(p); } }),
      tmpDir: '/tmp',
    });
    await assert.rejects(() => writer.writeAudioMetadata('/music/song.m4a', { title: 'T' }));
    assert.ok(unlinkCalls.some(p => p.includes('.downtune-meta-')));
  });

  test('ffmpeg failure with artwork cleans up both temp files', async () => {
    const unlinkCalls = [];
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: makeMockExecFile(true),
      fsMod: makeMockFs({ unlink: async (p) => { unlinkCalls.push(p); } }),
      tmpDir: '/tmp',
    });
    const tags = {
      title: 'T',
      image: { mime: 'image/jpeg', imageBuffer: Buffer.from('fake') },
    };
    await assert.rejects(() => writer.writeAudioMetadata('/music/song.flac', tags));
    assert.ok(unlinkCalls.some(p => p.includes('downtune-art-')));
    assert.ok(unlinkCalls.some(p => p.includes('.downtune-meta-')));
  });

  test('unsupported extension throws a clear error in writeAudioMetadata', async () => {
    const writer = new AudioMetadataWriter();
    await assert.rejects(
      () => writer.writeAudioMetadata('/music/song.wav', { title: 'T' }),
      /Unsupported audio format/,
    );
  });

  test('unsupported extension throws a clear error in updateAudioMetadata', async () => {
    const writer = new AudioMetadataWriter();
    await assert.rejects(
      () => writer.updateAudioMetadata('/music/song.aac', { title: 'T' }),
      /Unsupported audio format/,
    );
  });
});

// ── artwork embedding ──────────────────────────────────────────────────────────

describe('AudioMetadataWriter — artwork embedding', () => {
  test('writes artwork buffer to tmpDir and passes its path to ffmpeg', async () => {
    let artworkWritePath = null;
    let capturedArgs = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async (_b, args) => { capturedArgs = args; return {}; },
      fsMod: makeMockFs({ writeFile: async (p) => { artworkWritePath = p; } }),
      tmpDir: '/tmp',
    });
    const tags = {
      title: 'T',
      image: { mime: 'image/jpeg', imageBuffer: Buffer.from('fake-jpeg') },
    };
    await writer.writeAudioMetadata('/music/song.m4a', tags);
    assert.ok(artworkWritePath, 'artwork temp file should be written');
    assert.ok(artworkWritePath.startsWith('/tmp/'), 'artwork written to tmpDir');
    assert.ok(artworkWritePath.includes('downtune-art-'));
    assert.ok(artworkWritePath.endsWith('.jpg'));
    assert.ok(capturedArgs.includes(artworkWritePath), 'artwork path passed to ffmpeg');
    assert.ok(capturedArgs.includes('1:v'), 'video stream mapped');
  });

  test('uses .png extension for image/png mime type', async () => {
    let artworkWritePath = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async () => ({}),
      fsMod: makeMockFs({ writeFile: async (p) => { artworkWritePath = p; } }),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.flac', {
      image: { mime: 'image/png', imageBuffer: Buffer.from('fake-png') },
    });
    assert.ok(artworkWritePath.endsWith('.png'));
  });

  test('does not pass artwork path to ffmpeg when image is absent', async () => {
    let capturedArgs = null;
    const writer = new AudioMetadataWriter({
      nodeId3: makeMockNodeId3(),
      execFileFn: async (_b, args) => { capturedArgs = args; return {}; },
      fsMod: makeMockFs(),
      tmpDir: '/tmp',
    });
    await writer.writeAudioMetadata('/music/song.m4a', { title: 'T' });
    assert.ok(!capturedArgs.includes('1:v'), 'no video stream mapped without artwork');
    assert.ok(!capturedArgs.includes('attached_pic'), 'no attached_pic without artwork');
  });
});
