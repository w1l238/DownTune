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
  async enrich(artist, title) {
    if (!artist || !title) return { album: 'YouTube Music' };

    const cacheKey = `${artist.toLowerCase()}|${title.toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // Only return if it actually has enriched data, otherwise try again
      if (cached.trackNumber || cached.year) {
          // info(`Cache hit for metadata: ${artist} - ${title}`);
          return cached;
      }
    }

    try {
      await this.throttle();
      
      const query = `recording:"${title}" AND artist:"${artist}"`;
      const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&inc=tags`;
      
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
      const enrichment = this.parseMusicBrainz(data, title);
      
      info(`Enrichment result for "${title}": album="${enrichment.album}", year="${enrichment.year}", track="${enrichment.trackNumber}"`);
      
      this.cache.set(cacheKey, enrichment);
      await this.saveCache();
      
      return enrichment;
    } catch (err) {
      warning(`Metadata enrichment failed for ${artist} - ${title}: ${err.message}`);
      return { album: 'YouTube Music' };
    }
  }

  parseMusicBrainz(data, title) {
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
    let trackNumber = undefined;
    if (bestRelease.media) {
        for (const media of bestRelease.media) {
            if (media.track) {
                const matchedTrack = media.track.find(t => t.title.toLowerCase() === title.toLowerCase());
                if (matchedTrack) {
                    trackNumber = matchedTrack.number;
                    break;
                }
            }
        }
    }

    // Extract genre if available
    let genre = undefined;
    if (recording.tags && recording.tags.length > 0) {
        genre = recording.tags[0].name;
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
