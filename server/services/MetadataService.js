import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { info, error, warning } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '../metadata_cache.json');

export class MetadataService {
  constructor() {
    this.cache = new Map();
    this.lastRequestTime = 0;
    this.MIN_REQUEST_INTERVAL = 1100; // 1 second + buffer for MusicBrainz rate limit
    this.queue = Promise.resolve();
    this.loadCache();
  }

  async loadCache() {
    try {
      const data = await fs.readFile(CACHE_FILE, 'utf-8');
      const json = JSON.parse(data);
      Object.entries(json).forEach(([key, val]) => this.cache.set(key, val));
      info(`Loaded ${this.cache.size} entries from metadata cache.`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        error(`Error loading metadata cache: ${err.message}`);
      }
    }
  }

  async saveCache() {
    try {
      const obj = Object.fromEntries(this.cache);
      await fs.writeFile(CACHE_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
      error(`Error saving metadata cache: ${err.message}`);
    }
  }

  /**
   * Enriches track info with album metadata.
   * @param {string} artist 
   * @param {string} title 
   * @returns {Promise<{album: string, year?: string}>}
   */
  async enrich(artist, title, albumHint = '') {
    if (!artist || !title) return { album: 'YouTube Music' };

    const nArtist = artist.toLowerCase();
    const nTitle = title.toLowerCase();
    const nAlbumHint = albumHint.toLowerCase();

    // Include albumHint in cache key so different album contexts get independent results
    const cacheKey = `${nArtist}|${nTitle}|${nAlbumHint}`;
    const legacyCacheKey = `${nArtist}|${nTitle}`;

    const getValidCached = (key) => {
      if (!this.cache.has(key)) return null;
      const cached = this.cache.get(key);
      const trackNumOk = !cached.trackNumber || /^\d+$/.test(cached.trackNumber);
      return (cached.trackNumber || cached.year) && trackNumOk ? cached : null;
    };

    const primary = getValidCached(cacheKey);
    if (primary) return primary;

    // Fall back to legacy two-part key only when no albumHint is provided,
    // to preserve compatibility with existing metadata_cache.json entries.
    if (!nAlbumHint) {
      const legacy = getValidCached(legacyCacheKey);
      if (legacy) return legacy;
    }

    try {
      await this.throttle();

      const query = `recording:"${title}" AND artist:"${artist}"`;
      const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&inc=genres+tags`;

      info(`Enriching metadata via MusicBrainz: ${artist} - ${title}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SpotifyDownloader/1.0.0 ( mailto:w1l@example.com )'
        }
      });

      if (!response.ok) {
        throw new Error(`MusicBrainz API error: ${response.status}`);
      }

      const data = await response.json();
      const enrichment = this.parseMusicBrainz(data, title, albumHint);
      
      info(`Enrichment result for "${title}": album="${enrichment.album}", year="${enrichment.year}", track="${enrichment.trackNumber}"`);
      
      this.cache.set(cacheKey, enrichment);
      await this.saveCache();
      
      return enrichment;
    } catch (err) {
      warning(`Metadata enrichment failed for ${artist} - ${title}: ${err.message}`);
      return { album: 'YouTube Music' };
    }
  }

  parseMusicBrainz(data, title, albumHint = '') {
    if (!data.recordings || data.recordings.length === 0) {
      info(`No MusicBrainz recordings found for "${title}"`);
      return { album: 'YouTube Music' };
    }

    let allPotentialReleases = [];

    // Collect releases from all recording matches to find the best one
    data.recordings.forEach(recording => {
      if (recording.releases) {
        recording.releases.forEach(release => {
          allPotentialReleases.push({
            release,
            firstReleaseDate: recording['first-release-date']
          });
        });
      }
    });

    if (allPotentialReleases.length === 0) {
      return { album: 'YouTube Music' };
    }

    // Score each release to find the most "authentic" studio album
    const scoredReleases = allPotentialReleases.map(item => {
      const r = item.release;
      let score = 0;

      // Status scoring
      if (r.status === 'Official') score += 20;
      else if (r.status === 'Promotion') score += 5;
      else if (r.status === 'Bootleg') score -= 50;

      // Release Group Type scoring
      const rg = r['release-group'] || {};
      const primaryType = rg['primary-type'];
      const secondaryTypes = rg['secondary-types'] || [];

      if (primaryType === 'Album') score += 15;
      else if (primaryType === 'EP') score += 10;
      else if (primaryType === 'Single') score += 5;

      // Secondary types (penalize non-studio)
      if (secondaryTypes.includes('Compilation')) score -= 10;
      if (secondaryTypes.includes('Live')) score -= 100; // Heavily penalize live
      if (secondaryTypes.includes('Remix')) score -= 20;
      if (secondaryTypes.includes('Soundtrack')) score += 5;

      // Artist credit scoring (prefer primary artist over Various Artists)
      const artistCredit = r['artist-credit'] || [];
      const isVarious = artistCredit.some(c => c.artist && c.artist.name === 'Various Artists');
      if (isVarious) score -= 15;

      // Penalise vinyl/non-standard track numbering (A1, B6, etc.)
      const allTracks = (r.media || []).flatMap(m => m.track || []);
      const hasVinylNumbers = allTracks.length > 0 &&
          allTracks.every(t => t.number && !/^\d+$/.test(t.number));
      if (hasVinylNumbers) score -= 15;

      // Boost releases that match the song's existing album metadata
      if (albumHint) {
        const hint = albumHint.toLowerCase();
        const rTitle = r.title.toLowerCase();
        if (rTitle === hint) score += 40;
        else if (rTitle.includes(hint) || hint.includes(rTitle)) score += 20;
      }

      // Title-based penalties
      const lowerTitle = r.title.toLowerCase();
      if (lowerTitle.includes('live at')) score -= 100;
      if (lowerTitle.includes('best of')) score -= 10;
      if (lowerTitle.includes('greatest hits')) score -= 10;

      return {
        ...item,
        score
      };
    });

    // Sort by score descending
    scoredReleases.sort((a, b) => b.score - a.score);

    const best = scoredReleases[0];
    const bestRelease = best.release;

    // Try to find track number in the best release
    // Prefer the display `number` when it's a plain integer; fall back to `position`
    // (which is always a sequential integer) to avoid vinyl-style labels like "B6"
    let trackNumber = undefined;
    if (bestRelease.media) {
        for (const media of bestRelease.media) {
            if (media.track) {
                const matchedTrack = media.track.find(t => t.title.toLowerCase() === title.toLowerCase());
                if (matchedTrack) {
                    const raw = matchedTrack.number;
                    trackNumber = /^\d+$/.test(raw)
                        ? raw
                        : String(matchedTrack.position ?? raw);
                    break;
                }
            }
        }
    }

    // Extract genre — prefer curated genres over folksonomy tags
    let genre = undefined;
    const sourceRecording = data.recordings.find(r =>
        r.releases && r.releases.some(rel => rel.title === bestRelease.title)
    );
    if (sourceRecording?.genres?.length > 0) {
        genre = sourceRecording.genres[0].name;
    } else if (sourceRecording?.tags?.length > 0) {
        genre = sourceRecording.tags[0].name;
    }

    return {
      album: bestRelease.title,
      year: bestRelease.date ? bestRelease.date.substring(0, 4) : best.firstReleaseDate?.substring(0, 4),
      releaseDate: bestRelease.date || best.firstReleaseDate,
      trackNumber,
      genre
    };
  }

  async throttle() {
    const nextTask = this.queue.then(async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
        const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.lastRequestTime = Date.now();
    });
    this.queue = nextTask;
    return nextTask;
  }
}

export const metadataService = new MetadataService();
