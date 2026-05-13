import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MetadataService } from '../services/MetadataService.js';

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

  test('returns cached value on second call', async () => {
    const key = 'cache test artist';
    const val = { album: 'Cached Album', year: '2021' };
    svc.cache.set(`${key}|cached song`, val);
    const result = await svc.enrich(key, 'Cached Song');
    assert.deepEqual(result, val);
  });
});
