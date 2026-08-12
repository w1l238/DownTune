import { SongProvider } from './SongProvider.js';
import { runYtDlp } from '../utils/yt-dlp-helper.js';
import { info, error } from '../logger.js';
import { metadataService } from '../services/MetadataService.js';
import { cleanYoutubeArtist, cleanYoutubeTitle, resolveCanonicalYoutube } from '../services/YoutubeMetadataService.js';

export function normalizeYoutubeVideo(videoInfo, sourceUrl) {
  const artist = videoInfo.artist || videoInfo.uploader || videoInfo.channel || 'Unknown Artist';
  const thumbnails = Array.isArray(videoInfo.thumbnails)
    ? videoInfo.thumbnails.slice(-2).map(thumbnail => ({
        url: thumbnail.url,
        height: thumbnail.height,
        width: thumbnail.width,
      })).filter(thumbnail => thumbnail.url)
    : [];

  return {
    id: `youtube-${videoInfo.id || Buffer.from(sourceUrl).toString('base64url')}`,
    name: videoInfo.track || videoInfo.title || 'Untitled YouTube video',
    artists: [{ name: artist.replace(/\s*-\s*Topic$/i, '').replace(/\s*VEVO$/i, '').trim() }],
    album: {
      name: videoInfo.album || 'YouTube Music',
      images: thumbnails,
      release_date: videoInfo.release_date || videoInfo.upload_date || undefined,
    },
    trackNumber: videoInfo.track_number || undefined,
    genre: videoInfo.genre || undefined,
    duration: videoInfo.duration || undefined,
    isYoutube: true,
    isDirectYoutube: true,
    url: sourceUrl,
  };
}

export class YoutubeMusicProvider extends SongProvider {
  constructor(runYtDlpFn = runYtDlp, fetchFn = globalThis.fetch) {
    super();
    this.runYtDlp = runYtDlpFn;
    this.fetch = fetchFn;
  }

  getName() {
    return 'YouTube Music';
  }

  async resolveUrl(url) {
    info(`Resolving direct YouTube URL: ${url}`);
    return resolveCanonicalYoutube(url, { runYtDlpFn: this.runYtDlp, fetchFn: this.fetch });
  }

  async search(query, limit = 20) {
    info(`YouTube Music Search: "${query}" (limit: ${limit})`);
    
    try {
      // We append "music" to the search to favor music results if not already present
      const searchQuery = query.toLowerCase().includes('music') ? query : `${query} music`;
      const searchArgs = [
        `ytsearch${limit}:${searchQuery}`,
        '--dump-json',
        '--flat-playlist', // Much faster for multiple results
        '--skip-download',
        '--ignore-errors' // Don't crash if one result is unavailable
      ];

      const stdout = await runYtDlp(searchArgs);
      if (!stdout) {
        return { items: [] };
      }

      const lines = stdout.trim().split('\n');
      const rawItems = lines.map(line => {
        try {
          const videoInfo = JSON.parse(line);
          const originalTitle = videoInfo.title;
          
          let trackName = videoInfo.track || videoInfo.title;
          let artistName = videoInfo.artist || videoInfo.uploader || videoInfo.channel || 'Unknown Artist';
          let albumName = videoInfo.album;

          // With --flat-playlist we don't get the description usually
          if (!albumName) albumName = 'YouTube Music';
          artistName = this.cleanArtist(artistName);

          // Score results: 3 = Audio/Official Audio, 2 = Official Video/Music Video, 1 = other
          let score = 1;
          const lowerTitle = originalTitle.toLowerCase();
          if (lowerTitle.includes('audio')) score = 3;
          else if (lowerTitle.includes('video')) score = 2;

          // Clean title if it looks like "Artist - Title (Suffix)"
          if (!videoInfo.track && trackName === videoInfo.title) {
            trackName = this.cleanTitle(trackName, artistName);
          }

          // Map to Spotify-like format that Results.jsx expects
          return {
            id: videoInfo.id,
            name: trackName,
            artists: [
              { name: artistName }
            ],
            album: {
              name: albumName,
              images: Array.isArray(videoInfo.thumbnails) ? videoInfo.thumbnails.slice(-2).map(t => ({
                url: t.url,
                height: t.height,
                width: t.width
              })) : [],
              release_date: videoInfo.upload_date ? `${videoInfo.upload_date.substring(0, 4)}` : undefined
            },
            score, // Temporarily store score for sorting
            isYoutube: true,
            url: videoInfo.url || videoInfo.webpage_url
          };
        } catch (e) {
          return null;
        }
      }).filter(item => item !== null)
      .sort((a, b) => b.score - a.score); // Sort by score descending

      // Enrich top 5 results with better metadata (throttled internally)
      const enrichedItems = await Promise.all(
        rawItems.map(async (item, index) => {
          if (index < 5 && (item.album.name === 'YouTube Music' || !item.trackNumber)) {
            const metadata = await metadataService.enrich(item.artists[0].name, item.name);
            return {
              ...item,
              trackNumber: metadata.trackNumber || item.trackNumber,
              genre: metadata.genre || item.genre,
              album: {
                ...item.album,
                name: (item.album.name === 'YouTube Music' && metadata.album !== 'YouTube Music') ? metadata.album : item.album.name,
                release_date: metadata.year || item.album.release_date
              }
            };
          }
          return item;
        })
      );

      return { items: enrichedItems };
    } catch (err) {
      error('Error searching YouTube Music:', err);
      throw new Error('Error searching YouTube Music');
    }
  }

  /**
   * Cleans artist names from common suffixes.
   * @param {string} artist 
   */
  cleanArtist(artist) {
    return cleanYoutubeArtist(artist);
  }

  /**
   * Cleans common YouTube title junk.
   * @param {string} title 
   * @param {string} artist 
   */
  cleanTitle(title, artist) {
    let clean = title;

    // Remove artist name prefix if it exists: "Artist - Title" -> "Title"
    const artistEscaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const artistRegex = new RegExp(`^${artistEscaped}\\s*-\\s*`, 'i');
    clean = clean.replace(artistRegex, '');

    // Remove common suffixes
    const suffixes = [
        /\(Official Audio\)/i,
        /\(Official Video\)/i,
        /\(Official Music Video\)/i,
        /\(Audio\)/i,
        /\(Video\)/i,
        /\[Official Audio\]/i,
        /\[Official Video\]/i,
        /\(Lyric Video\)/i,
        /\(Lyrics\)/i,
        /Official Audio/i,
        /Official Video/i
    ];

    suffixes.forEach(reg => {
        clean = clean.replace(reg, '');
    });

    return cleanYoutubeTitle(clean);
  }
}
