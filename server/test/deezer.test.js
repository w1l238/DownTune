import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DeezerProvider } from '../providers/DeezerProvider.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Minimal Deezer API track shape
const makeDeezerTrack = (overrides = {}) => ({
    id: 123,
    title: 'Test Song',
    track_position: 4,
    artist: { name: 'Test Artist' },
    album: {
        id: 456,
        title: 'Test Album',
        cover_xl: 'https://cdn/cover_xl.jpg',
        cover_medium: 'https://cdn/cover_medium.jpg',
        cover_small: 'https://cdn/cover_small.jpg',
    },
    link: 'https://www.deezer.com/track/123',
    ...overrides,
});

const mockSearch = (data) => {
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => data,
    });
};

describe('DeezerProvider.search', () => {
    let provider;
    beforeEach(() => { provider = new DeezerProvider(); });

    test('maps track id with deezer- prefix', async () => {
        mockSearch({ data: [makeDeezerTrack({ id: 99 })], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].id, 'deezer-99');
    });

    test('maps track name correctly', async () => {
        mockSearch({ data: [makeDeezerTrack({ title: 'My Song' })], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].name, 'My Song');
    });

    test('maps track_position to trackNumber', async () => {
        mockSearch({ data: [makeDeezerTrack({ track_position: 7 })], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].trackNumber, 7);
    });

    test('maps artist name into artists array', async () => {
        mockSearch({ data: [makeDeezerTrack({ artist: { name: 'Dayseeker' } })], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].artists.length, 1);
        assert.equal(items[0].artists[0].name, 'Dayseeker');
    });

    test('maps album name correctly', async () => {
        mockSearch({ data: [makeDeezerTrack()], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].album.name, 'Test Album');
    });

    test('album images include xl, medium, small in order', async () => {
        mockSearch({ data: [makeDeezerTrack()], next: null, prev: null });
        const { items } = await provider.search('test');
        const urls = items[0].album.images.map(i => i.url);
        assert.equal(urls[0], 'https://cdn/cover_xl.jpg');
        assert.equal(urls[1], 'https://cdn/cover_medium.jpg');
        assert.equal(urls[2], 'https://cdn/cover_small.jpg');
    });

    test('filters out images with missing urls', async () => {
        const track = makeDeezerTrack();
        track.album.cover_xl = null;
        mockSearch({ data: [track], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].album.images.length, 2);
        assert.ok(items[0].album.images.every(i => i.url));
    });

    test('sets isDeezer flag to true', async () => {
        mockSearch({ data: [makeDeezerTrack()], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].isDeezer, true);
    });

    test('maps track link to url', async () => {
        mockSearch({ data: [makeDeezerTrack({ link: 'https://www.deezer.com/track/99' })], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items[0].url, 'https://www.deezer.com/track/99');
    });

    test('passes next and previous pagination urls through', async () => {
        mockSearch({ data: [makeDeezerTrack()], next: 'https://api.deezer.com/search?next', prev: 'https://api.deezer.com/search?prev' });
        const result = await provider.search('test');
        assert.equal(result.next, 'https://api.deezer.com/search?next');
        assert.equal(result.previous, 'https://api.deezer.com/search?prev');
    });

    test('returns empty items array when data is empty', async () => {
        mockSearch({ data: [], next: null, prev: null });
        const { items } = await provider.search('test');
        assert.equal(items.length, 0);
    });

    test('throws when API returns an error', async () => {
        globalThis.fetch = async () => ({
            ok: false,
            status: 500,
            json: async () => ({ error: { message: 'Service unavailable' } }),
        });
        await assert.rejects(() => provider.search('test'), /Error searching Deezer/);
    });

    test('throws on network failure', async () => {
        globalThis.fetch = async () => { throw new Error('Network error'); };
        await assert.rejects(() => provider.search('test'), /Error searching Deezer/);
    });
});
