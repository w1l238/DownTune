import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LyricsService } from '../services/LyricsService.js';

// Helper: build a minimal fetch mock that returns the given response config
const mockFetch = (status, body) => {
    globalThis.fetch = async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    });
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe('LyricsService.fetch', () => {
    let svc;
    beforeEach(() => { svc = new LyricsService(); });

    test('returns null when artist is missing', async () => {
        const result = await svc.fetch('', 'Some Song', 'Some Album');
        assert.equal(result, null);
    });

    test('returns null when title is missing', async () => {
        const result = await svc.fetch('Some Artist', '', 'Some Album');
        assert.equal(result, null);
    });

    test('returns plainLyrics string on successful response', async () => {
        mockFetch(200, { plainLyrics: 'Verse one\nVerse two', syncedLyrics: null, instrumental: false });
        const result = await svc.fetch('Artist', 'Title', 'Album');
        assert.equal(result, 'Verse one\nVerse two');
    });

    test('returns null on 404', async () => {
        mockFetch(404, {});
        const result = await svc.fetch('Artist', 'Title', 'Album');
        assert.equal(result, null);
    });

    test('returns null on non-ok status', async () => {
        mockFetch(500, {});
        const result = await svc.fetch('Artist', 'Title', 'Album');
        assert.equal(result, null);
    });

    test('returns null for instrumental track', async () => {
        mockFetch(200, { plainLyrics: null, syncedLyrics: null, instrumental: true });
        const result = await svc.fetch('Artist', 'Title', 'Album');
        assert.equal(result, null);
    });

    test('returns null when plainLyrics is absent', async () => {
        mockFetch(200, { syncedLyrics: '[00:01.00] line', instrumental: false });
        const result = await svc.fetch('Artist', 'Title', 'Album');
        assert.equal(result, null);
    });

    test('returns null on network error', async () => {
        globalThis.fetch = async () => { throw new Error('Network failure'); };
        const result = await svc.fetch('Artist', 'Title', 'Album');
        assert.equal(result, null);
    });

    test('includes duration in request when provided', async () => {
        let capturedUrl = '';
        globalThis.fetch = async (url) => {
            capturedUrl = url;
            return { ok: true, status: 200, json: async () => ({ plainLyrics: 'lyrics', instrumental: false }) };
        };
        await svc.fetch('Artist', 'Title', 'Album', 210);
        assert.ok(capturedUrl.includes('duration=210'), `URL should contain duration=210, got: ${capturedUrl}`);
    });

    test('includes all query params in request URL', async () => {
        let capturedUrl = '';
        globalThis.fetch = async (url) => {
            capturedUrl = url;
            return { ok: true, status: 200, json: async () => ({ plainLyrics: 'lyrics', instrumental: false }) };
        };
        await svc.fetch('Dayseeker', 'The Living Dead', 'Creature In The Black Night');
        assert.ok(capturedUrl.includes('artist_name=Dayseeker'));
        assert.ok(capturedUrl.includes('track_name=The+Living+Dead'));
    });
});
