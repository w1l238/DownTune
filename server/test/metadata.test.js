import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MetadataService } from '../services/MetadataService.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const svc = new MetadataService();

const makeRelease = (overrides = {}) => ({
  title: 'Test Album',
  status: 'Official',
  date: '2020-01-01',
  'release-group': { 'primary-type': 'Album', 'secondary-types': [] },
  'artist-credit': [],
  media: [],
  ...overrides,
});

const makeData = (releases = [], firstReleaseDate = '2020') => ({
  recordings: releases.length === 0 ? [] : [
    {
      'first-release-date': firstReleaseDate,
      releases,
    },
  ],
});

describe('MetadataService.parseMusicBrainz', () => {
  test('returns fallback when recordings is empty', () => {
    const result = svc.parseMusicBrainz({ recordings: [] }, 'Any Song');
    assert.deepEqual(result, { album: 'YouTube Music' });
  });

  test('returns fallback when recordings have no releases', () => {
    const data = { recordings: [{ 'first-release-date': '2020', releases: [] }] };
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.deepEqual(result, { album: 'YouTube Music' });
  });

  test('returns album title and year from best release', () => {
    const data = makeData([makeRelease({ title: 'Studio Album', date: '2019-06-01' })]);
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.album, 'Studio Album');
    assert.equal(result.year, '2019');
  });

  test('prefers official studio album over live release', () => {
    const data = makeData([
      makeRelease({
        title: 'Live At Wembley',
        'release-group': { 'primary-type': 'Album', 'secondary-types': ['Live'] },
      }),
      makeRelease({ title: 'Studio Album' }),
    ]);
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.album, 'Studio Album');
  });

  test('penalizes compilation releases', () => {
    const data = makeData([
      makeRelease({
        title: 'Greatest Hits',
        'release-group': { 'primary-type': 'Album', 'secondary-types': ['Compilation'] },
      }),
      makeRelease({ title: 'Original Album' }),
    ]);
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.album, 'Original Album');
  });

  test('penalizes bootleg releases heavily', () => {
    const data = makeData([
      makeRelease({ title: 'Bootleg Recording', status: 'Bootleg' }),
      makeRelease({ title: 'Official Release' }),
    ]);
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.album, 'Official Release');
  });

  test('penalizes Various Artists releases', () => {
    const data = makeData([
      makeRelease({
        title: 'Soundtrack',
        'artist-credit': [{ artist: { name: 'Various Artists' } }],
      }),
      makeRelease({ title: 'Studio Album' }),
    ]);
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.album, 'Studio Album');
  });

  test('extracts track number when title matches media track', () => {
    const data = makeData([
      makeRelease({
        title: 'Studio Album',
        media: [{ track: [{ title: 'My Song', number: '3' }] }],
      }),
    ]);
    const result = svc.parseMusicBrainz(data, 'My Song');
    assert.equal(result.trackNumber, '3');
  });

  test('track number is undefined when title does not match', () => {
    const data = makeData([
      makeRelease({
        title: 'Studio Album',
        media: [{ track: [{ title: 'Other Song', number: '1' }] }],
      }),
    ]);
    const result = svc.parseMusicBrainz(data, 'My Song');
    assert.equal(result.trackNumber, undefined);
  });

  test('falls back to firstReleaseDate when release has no date', () => {
    const data = makeData(
      [makeRelease({ title: 'Studio Album', date: undefined })],
      '2018'
    );
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.year, '2018');
  });
});

describe('MetadataService.enrich', () => {
  test('returns fallback when artist is missing', async () => {
    const result = await svc.enrich('', 'Some Song');
    assert.deepEqual(result, { album: 'YouTube Music' });
  });

  test('returns fallback when title is missing', async () => {
    const result = await svc.enrich('Some Artist', '');
    assert.deepEqual(result, { album: 'YouTube Music' });
  });

  test('returns cached value on second call (legacy key, no albumHint)', async () => {
    const key = 'cache test artist';
    const val = { album: 'Cached Album', year: '2021' };
    svc.cache.set(`${key}|cached song`, val);
    const result = await svc.enrich(key, 'Cached Song');
    assert.deepEqual(result, val);
  });

  test('returns cached value when album-aware primary key matches', async () => {
    const freshSvc = new MetadataService();
    const val = { album: 'Specific Album', year: '2022' };
    freshSvc.cache.set('primary artist|primary song|primary album', val);
    const result = await freshSvc.enrich('Primary Artist', 'Primary Song', 'Primary Album');
    assert.deepEqual(result, val);
  });

  test('ignores legacy key when explicit albumHint is provided', async () => {
    const freshSvc = new MetadataService();
    const legacyVal = { album: 'Legacy Album', year: '2019' };
    freshSvc.cache.set('explicit artist|explicit song', legacyVal);
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => makeData([makeRelease({ title: 'Fresh Album', date: '2024-01-01' })]),
    });
    const result = await freshSvc.enrich('Explicit Artist', 'Explicit Song', 'Some Hint');
    assert.equal(result.album, 'Fresh Album');
  });

  test('returns enriched data from MusicBrainz on successful fetch', async () => {
    const freshSvc = new MetadataService();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => makeData([
        makeRelease({ title: 'Live Album', date: '2022-05-01' }),
      ]),
    });
    const result = await freshSvc.enrich('Some Artist', 'Network Song');
    assert.equal(result.album, 'Live Album');
    assert.equal(result.year, '2022');
  });

  test('caches result after successful MusicBrainz fetch', async () => {
    const freshSvc = new MetadataService();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => makeData([makeRelease({ title: 'Cached Net Album', date: '2023-01-01' })]),
    });
    await freshSvc.enrich('Cache Artist', 'Cache Song');
    // Second call — fetch will be restored to real, so if it hits network again it would fail
    globalThis.fetch = async () => { throw new Error('Should not reach network on second call'); };
    const result = await freshSvc.enrich('Cache Artist', 'Cache Song');
    assert.equal(result.album, 'Cached Net Album');
  });

  test('returns fallback when MusicBrainz API returns non-ok status', async () => {
    const freshSvc = new MetadataService();
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const result = await freshSvc.enrich('Bad Artist', 'Bad Song');
    assert.deepEqual(result, { album: 'YouTube Music' });
  });

  test('returns fallback on network error', async () => {
    const freshSvc = new MetadataService();
    globalThis.fetch = async () => { throw new Error('Network failure'); };
    const result = await freshSvc.enrich('Artist', 'Song');
    assert.deepEqual(result, { album: 'YouTube Music' });
  });
});

describe('MetadataService.parseMusicBrainz — genre extraction', () => {
  test('extracts genre from curated genres array when present', () => {
    const data = {
      recordings: [{
        'first-release-date': '2020',
        genres: [{ name: 'rock', count: 5 }, { name: 'alternative', count: 2 }],
        tags: [{ name: 'some-tag', count: 1 }],
        releases: [makeRelease({ title: 'Genre Album' })],
      }],
    };
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.genre, 'rock');
  });

  test('falls back to tags when genres array is absent', () => {
    const data = {
      recordings: [{
        'first-release-date': '2020',
        tags: [{ name: 'post-hardcore', count: 3 }],
        releases: [makeRelease({ title: 'Tag Album' })],
      }],
    };
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.genre, 'post-hardcore');
  });

  test('genre is undefined when neither genres nor tags are present', () => {
    const data = makeData([makeRelease({ title: 'No Genre Album' })]);
    const result = svc.parseMusicBrainz(data, 'Any Song');
    assert.equal(result.genre, undefined);
  });
});
