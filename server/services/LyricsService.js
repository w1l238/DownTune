import { info, warning } from '../logger.js';

const BASE_URL = 'https://lrclib.net/api';
const USER_AGENT = 'DownTune/1.0 (https://github.com/w1l238/Spotify-Downloader-Web-Server)';

export class LyricsService {
    /**
     * Fetch plain lyrics from LRCLIB.
     * Returns the lyrics string, or null if not found.
     * @param {string} artist
     * @param {string} title
     * @param {string} album
     * @param {number|null} duration  seconds, improves match accuracy
     */
    async fetch(artist, title, album, duration = null) {
        if (!artist || !title) return null;

        try {
            const params = new URLSearchParams({
                artist_name: artist,
                track_name: title,
                album_name: album || '',
            });
            if (duration) params.set('duration', Math.round(duration));

            const url = `${BASE_URL}/get?${params}`;
            info(`Fetching lyrics from LRCLIB: ${artist} — ${title}`);

            const res = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(8000),
            });

            if (res.status === 404) {
                warning(`LRCLIB: no lyrics found for "${title}" by "${artist}"`);
                return null;
            }

            if (!res.ok) {
                warning(`LRCLIB returned ${res.status} for "${title}"`);
                return null;
            }

            const data = await res.json();

            if (data.instrumental) {
                info(`LRCLIB: "${title}" is instrumental, skipping lyrics`);
                return null;
            }

            const lyrics = data.plainLyrics || null;
            if (lyrics) info(`LRCLIB: lyrics found for "${title}"`);
            return lyrics;
        } catch (err) {
            warning(`LRCLIB fetch failed for "${title}": ${err.message}`);
            return null;
        }
    }
}

export const lyricsService = new LyricsService();
