import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidYouTubeUrl, looksLikeHttpsUrl } from '../utils/url-validator.js';
import { normalizeYoutubeVideo } from '../providers/YoutubeMusicProvider.js';
import {
  cleanYoutubeTitle,
  clearYoutubeMetadataCache,
  extractYoutubeCandidates,
  parseProvidedMetadata,
  resolveCanonicalYoutube,
  scoreDeezerCandidate,
  selectDeezerMatch,
} from '../services/YoutubeMetadataService.js';

describe('YouTube URL validation', () => {
  test('accepts common HTTPS YouTube video URL forms', () => {
    assert.equal(isValidYouTubeUrl('https://www.youtube.com/watch?v=abc123'), true);
    assert.equal(isValidYouTubeUrl('https://youtu.be/abc123'), true);
    assert.equal(isValidYouTubeUrl('https://music.youtube.com/watch?v=abc123'), true);
    assert.equal(isValidYouTubeUrl('https://www.youtube.com/shorts/abc123'), true);
  });

  test('rejects non-HTTPS, lookalike, credentialed, and non-YouTube URLs', () => {
    assert.equal(isValidYouTubeUrl('http://youtube.com/watch?v=abc123'), false);
    assert.equal(isValidYouTubeUrl('https://youtube.com.evil.example/watch?v=abc123'), false);
    assert.equal(isValidYouTubeUrl('https://youtube.com@evil.example/watch?v=abc123'), false);
    assert.equal(isValidYouTubeUrl('https://example.com/video'), false);
    assert.equal(isValidYouTubeUrl('not a url'), false);
  });

  test('detects HTTPS queries without treating ordinary searches as URLs', () => {
    assert.equal(looksLikeHttpsUrl('  HTTPS://youtu.be/abc123'), true);
    assert.equal(looksLikeHttpsUrl('artist song title'), false);
  });
});

describe('direct YouTube result normalization', () => {
  test('returns the standard downloadable track shape and preserves source URL', () => {
    const sourceUrl = 'https://youtu.be/abc123';
    const track = normalizeYoutubeVideo({
      id: 'abc123',
      title: 'Example Song',
      uploader: 'Example Artist - Topic',
      album: 'Example Album',
      upload_date: '20250102',
      thumbnails: [{ url: 'https://i.ytimg.com/example.jpg', width: 1280, height: 720 }],
      duration: 180,
    }, sourceUrl);

    assert.equal(track.id, 'youtube-abc123');
    assert.equal(track.name, 'Example Song');
    assert.equal(track.artists[0].name, 'Example Artist');
    assert.equal(track.album.name, 'Example Album');
    assert.equal(track.album.images[0].url, 'https://i.ytimg.com/example.jpg');
    assert.equal(track.isYoutube, true);
    assert.equal(track.isDirectYoutube, true);
    assert.equal(track.url, sourceUrl);
  });

  test('provider resolves one URL without downloading and normalizes its metadata', async () => {
    let receivedArgs;
    const provider = new (await import('../providers/YoutubeMusicProvider.js')).YoutubeMusicProvider(async args => {
      receivedArgs = args;
      return JSON.stringify({
        id: 'resolved123',
        title: 'Resolved Video',
        channel: 'Resolved Channel',
        thumbnails: [],
      });
    }, async () => ({ ok: true, json: async () => ({ data: [] }) }));

    const sourceUrl = 'https://www.youtube.com/watch?v=resolved123';
    const track = await provider.resolveUrl(sourceUrl);

    assert.deepEqual(receivedArgs, [sourceUrl, '--dump-single-json', '--skip-download', '--no-playlist']);
    assert.equal(track.name, 'Resolved Video');
    assert.equal(track.album.name, 'YouTube Music');
    assert.equal(track.url, sourceUrl);
  });
});

describe('direct YouTube canonical metadata', () => {
  test('cleans terminal video decorations but preserves meaningful versions', () => {
    assert.equal(cleanYoutubeTitle('Song [Official Music Video]'), 'Song');
    assert.equal(cleanYoutubeTitle('Song Official Music Video'), 'Song');
    assert.equal(cleanYoutubeTitle('Song (Live) [Official Video]'), 'Song (Live)');
  });

  test('extracts Provided to YouTube metadata before uploader fallbacks', () => {
    const description = 'Provided to YouTube by Label\n\nSong Name · Artist Name\nAlbum Name\n\nReleased on: 2020-01-01';
    assert.deepEqual(parseProvidedMetadata(description), {
      title: 'Song Name', artist: 'Artist Name', album: 'Album Name',
    });
    const source = extractYoutubeCandidates({ title: 'Raw title', uploader: 'Label', description });
    assert.equal(source.title, 'Song Name');
    assert.equal(source.artist, 'Artist Name');
    assert.equal(source.album, 'Album Name');
  });

  test('parses the example Artist - Title form and preserves featured credits', () => {
    const source = extractYoutubeCandidates({
      title: 'Silverstein - Drain The Blood feat. Rory Rodriguez of Dayseeker [Official Music Video]',
      uploader: 'UNFD',
    });
    assert.equal(source.artist, 'Silverstein');
    assert.equal(source.title, 'Drain The Blood feat. Rory Rodriguez of Dayseeker');
    assert.equal(source.year, undefined);
  });

  test('requires artist and title agreement and rejects ambiguous candidates', () => {
    const source = { artist: 'Silverstein', title: 'Drain The Blood feat. Rory Rodriguez', duration: 220 };
    const exact = { id: 1, title_short: 'Drain The Blood', artist: { name: 'Silverstein' }, duration: 220 };
    const cover = { id: 2, title_short: 'Drain The Blood (Cover)', artist: { name: 'Other Band' }, duration: 220 };
    assert.ok(scoreDeezerCandidate(exact, source) >= 72);
    assert.equal(scoreDeezerCandidate(cover, source), 0);
    assert.equal(selectDeezerMatch([exact, { ...exact, id: 3 }], source), null);
  });

  test('maps a confident Deezer match while preserving YouTube identity and caches it', async () => {
    clearYoutubeMetadataCache();
    let ytCalls = 0;
    let fetchCalls = 0;
    const run = async () => {
      ytCalls += 1;
      return JSON.stringify({
        id: '70a2YqAXE3A',
        title: 'Silverstein - Drain The Blood feat. Rory Rodriguez of Dayseeker [Official Music Video]',
        uploader: 'UNFD', duration: 220,
        thumbnails: [{ url: 'https://youtube/thumb.jpg' }],
      });
    };
    const fetchFn = async url => {
      fetchCalls += 1;
      if (url.includes('/search?')) return { ok: true, json: async () => ({ data: [{
        id: 10, title: 'Drain The Blood', title_short: 'Drain The Blood', duration: 220,
        artist: { name: 'Silverstein' }, contributors: [{ name: 'Silverstein' }],
        album: { id: 20, title: 'Pink Moon' },
      }] }) };
      if (url.includes('/track/')) return { ok: true, json: async () => ({
        id: 10, title_short: 'Drain The Blood', duration: 220, track_position: 4, disk_number: 1,
        artist: { name: 'Silverstein' }, contributors: [{ name: 'Silverstein' }],
      }) };
      return { ok: true, json: async () => ({
        id: 20, title: 'Pink Moon', release_date: '2025-09-12', cover_xl: 'https://deezer/cover.jpg',
        genres: { data: [{ name: 'Post-Hardcore' }] },
      }) };
    };
    const url = 'https://music.youtube.com/watch?v=70a2YqAXE3A';
    const first = await resolveCanonicalYoutube(url, { runYtDlpFn: run, fetchFn });
    const second = await resolveCanonicalYoutube(url, { runYtDlpFn: run, fetchFn });
    assert.equal(first.name, 'Drain The Blood');
    assert.equal(first.artists[0].name, 'Silverstein');
    assert.equal(first.album.name, 'Pink Moon');
    assert.equal(first.album.images[0].url, 'https://deezer/cover.jpg');
    assert.equal(first.album.release_date, '2025-09-12');
    assert.equal(first.trackNumber, 4);
    assert.equal(first.discNumber, 1);
    assert.equal(first.genre, 'Post-Hardcore');
    assert.equal(first.url, url);
    assert.equal(first.isDirectYoutube, true);
    assert.equal(first.isDeezer, undefined);
    assert.deepEqual(second, first);
    assert.equal(ytCalls, 1);
    assert.equal(fetchCalls, 3);
  });

  test('keeps a cleaned usable fallback when Deezer has no confident match', async () => {
    clearYoutubeMetadataCache();
    const result = await resolveCanonicalYoutube('https://youtu.be/fallback', {
      runYtDlpFn: async () => JSON.stringify({
        id: 'fallback', title: 'Artist - Song [Official Audio]', uploader: 'Artist - Topic',
        thumbnails: [{ url: 'https://youtube/thumb.jpg' }], upload_date: '20260809',
      }),
      fetchFn: async () => ({ ok: true, json: async () => ({ data: [] }) }),
    });
    assert.equal(result.name, 'Song');
    assert.equal(result.artists[0].name, 'Artist');
    assert.equal(result.album.name, 'YouTube Music');
    assert.equal(result.album.images[0].url, 'https://youtube/thumb.jpg');
    assert.equal(result.album.release_date, undefined);
  });
});
