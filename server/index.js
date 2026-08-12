import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // Load environment variables
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path'; // Import path module
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { info, error, warning } from './logger.js';

process.on('exit', (code) => {
  warning(`Server is about to exit with code: ${code}`);
});

info('Server initialization started.');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get base download path from env or default
const getBaseDownloadPath = () => {
  return process.env.DOWNLOAD_PATH || path.join(__dirname, '..', 'downloads');
};

import { audioMetadataWriter } from './services/AudioMetadataWriter.js';
import { fetchArtworkTags, lookupArtworkUrl } from './services/artworkService.js';
import rateLimit from 'express-rate-limit';
import { getLibrary, refreshLibrary, deleteSong, getSongArt, updateSongMetadata, toggleFavorite, bulkLike, bulkDelete } from './libraryManager.js';
import { runYtDlp } from './utils/yt-dlp-helper.js';
import { isWithinDirectory } from './utils/path-helper.js';
import {
  DEFAULT_AUDIO_QUALITY_PRESET,
  getAudioQualityPreset,
  getAudioQualityPresetOptions,
  getYtDlpAudioQualityArgs,
  validateAudioQualityPreset,
} from './utils/audio-quality.js';
import {
  DEFAULT_AUDIO_FORMAT,
  getAudioFormat,
  getAudioFormatConfig,
  getAudioFormatOptions,
  getYtDlpAudioFormatArgs,
  validateAudioFormat,
} from './utils/audio-format.js';
import { SpotifyProvider } from './providers/SpotifyProvider.js';
import { YoutubeMusicProvider } from './providers/YoutubeMusicProvider.js';
import { DeezerProvider } from './providers/DeezerProvider.js';
import { metadataService } from './services/MetadataService.js';
import { resolveCanonicalYoutube } from './services/YoutubeMetadataService.js';
import { lyricsService } from './services/LyricsService.js';
import { isValidYouTubeUrl, looksLikeHttpsUrl } from './utils/url-validator.js';

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

// Allow CORS from the configured origin (set ALLOWED_ORIGIN in .env for production)
const corsOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// CSRF / same-origin guard: one token per server process; clients fetch via
// GET /api/csrf-token then echo it on mutations. Origin/Referer checks block
// browser-based cross-site writes even if a deployment keeps permissive CORS.
const csrfToken = randomBytes(32).toString('hex');
const allowedMutationOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
if (corsOrigin && corsOrigin !== '*') {
  corsOrigin.split(',').map(origin => origin.trim()).filter(Boolean).forEach(origin => allowedMutationOrigins.add(origin));
}

const isAllowedMutationOrigin = (req) => {
  const originHeader = req.get('origin') || req.get('referer');
  if (!originHeader) return true; // non-browser clients / curl
  try {
    const origin = new URL(originHeader).origin;
    return allowedMutationOrigins.has(origin);
  } catch {
    return false;
  }
};

const requireCsrf = (req, res, next) => {
  if (!isAllowedMutationOrigin(req)) {
    return res.status(403).json({ error: 'Cross-origin write blocked.' });
  }
  if (req.headers['x-csrf-token'] !== csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
  }
  next();
};

// Escape HTML special chars to prevent reflected XSS in HTML responses
const htmlEscape = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;');

const rejectEnvNewlines = (value, fieldName) => {
  if (value == null) return value;
  const str = String(value);
  if (/[\r\n]/.test(str)) {
    const err = new Error(`${fieldName} cannot contain newlines.`);
    err.status = 400;
    throw err;
  }
  return str;
};

const requireSameOriginRead = (req, res, next) => {
  if (!isAllowedMutationOrigin(req)) {
    return res.status(403).json({ error: 'Cross-origin read blocked.' });
  }
  next();
};

// Rate limiters for expensive endpoints
const downloadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const proxyLimiter   = rateLimit({ windowMs: 60 * 1000,       limit: 120, standardHeaders: true, legacyHeaders: false });
const searchLimiter  = rateLimit({ windowMs: 60 * 1000,       limit: 30,  standardHeaders: true, legacyHeaders: false });
const scanLimiter    = rateLimit({ windowMs: 60 * 1000,       limit: 5,   standardHeaders: true, legacyHeaders: false });

let spotifyAccessToken = '';
let tokenExpiryTime = 0;

// Function to get Spotify Access Token
async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    warning('Spotify credentials missing. Spotify provider will not be available.');
    return null;
  }

  info('Requesting Spotify access token from accounts.spotify.com...');
  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    if (response.ok) {
      spotifyAccessToken = data.access_token;
      tokenExpiryTime = Date.now() + (data.expires_in * 1000) - 60000;
      info(`Successfully obtained Spotify token. Valid for ${data.expires_in}s.`);
      return spotifyAccessToken;
    } else {
      error(`Spotify token request failed (${response.status}): ${JSON.stringify(data)}`);
      return null;
    }
  } catch (err) {
    error(`Network error while fetching Spotify token: ${err.message}`);
    return null;
  }
}

// Middleware to log requests and ensure we have a valid access token
app.use(async (req, res, next) => {
  const { method, url } = req;
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    let logMsg = `${method} ${url} ${res.statusCode} - ${duration}ms`;
    if (res.statusCode === 304) {
      logMsg += ' (Not Modified - Client Cache Hit)';
    }
    info(logMsg);
  });

  const hasSpotifyCreds = process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET;

  if (hasSpotifyCreds && (!spotifyAccessToken || Date.now() >= tokenExpiryTime)) {
    const reason = !spotifyAccessToken ? 'initially missing' : 'expired';
    info(`Spotify access token ${reason}. Refreshing...`);
    await getSpotifyAccessToken();
  }
  next();
});


// Helper to get the current search provider
const getSearchProvider = () => {
  const providerType = process.env.SEARCH_PROVIDER || 'spotify';
  const type = providerType.toLowerCase();

  if (type === 'youtube') return new YoutubeMusicProvider();
  if (type === 'deezer') return new DeezerProvider();
  return new SpotifyProvider(spotifyAccessToken);
};

// Safe bootstrap endpoint — returns CSRF token; no side effects
app.get('/api/csrf-token', (req, res) => {
  res.json({ token: csrfToken });
});

// Generic Search Endpoint
app.get('/api/search', searchLimiter, async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = parseInt(req.query.limit) || 10;
  const type  = req.query.type || 'tracks';

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    if (looksLikeHttpsUrl(query)) {
      if (!isValidYouTubeUrl(query)) {
        return res.status(400).json({ error: 'HTTPS URLs must be valid YouTube links.' });
      }

      try {
        const track = await new YoutubeMusicProvider().resolveUrl(query);
        const tracks = { items: [track], next: null, previous: null };
        return type === 'all'
          ? res.json({ tracks, artists: [], albums: [] })
          : res.json(tracks);
      } catch (err) {
        warning(`Direct YouTube URL could not be resolved: ${err.message}`);
        return res.status(422).json({ error: 'The YouTube link could not be resolved to a downloadable video.' });
      }
    }

    const provider = getSearchProvider();
    if (type === 'all' && typeof provider.searchAll === 'function') {
      const results = await provider.searchAll(query, limit);
      return res.json(results);
    }
    // Default: tracks only (backward-compatible)
    const results = await provider.search(query, limit);
    res.json(results);
  } catch (err) {
    error(`Search failed using ${process.env.SEARCH_PROVIDER || 'spotify'}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Artist detail — top tracks + albums
app.get('/api/artist/:id', searchLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    const provider = getSearchProvider();
    if (typeof provider.getArtist !== 'function') {
      return res.status(501).json({ error: 'Artist lookup not supported by current provider.' });
    }
    const data = await provider.getArtist(id);
    res.json(data);
  } catch (err) {
    error(`Artist fetch failed for id ${id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Album detail — all tracks
app.get('/api/album/:id', searchLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    const provider = getSearchProvider();
    if (typeof provider.getAlbum !== 'function') {
      return res.status(501).json({ error: 'Album lookup not supported by current provider.' });
    }
    const data = await provider.getAlbum(id);
    res.json(data);
  } catch (err) {
    error(`Album fetch failed for id ${id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Legacy Endpoint to search Spotify (kept for compatibility)
app.get('/search-spotify', searchLimiter, async (req, res) => {
  const query = req.query.q;
  const limit = req.query.limit || 10;
  info(`Spotify Search (Legacy): "${query}" (limit: ${limit})`);
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    const provider = getSearchProvider();
    const results = await provider.search(query, limit);
    // Legacy endpoint expects { tracks: { items, ... } }
    res.json({ tracks: results }); 
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to sanitize filenames
const sanitizeFilename = (name) => {
  return name.replace(/[/\\:*?"<>|\x00]/g, '_');
};

// Endpoint to create folder structure
app.post('/create-folder-structure', requireCsrf, async (req, res) => {
  info(`Received request to create folder structure for artist: "${req.body.artistName}", album: "${req.body.albumName}"`);
  const { artistName, albumName } = req.body;

  if (!artistName || !albumName) {
    return res.status(400).json({ error: 'Artist name and album name are required.' });
  }

  const baseDownloadPath = getBaseDownloadPath();
  const safeArtistName = sanitizeFilename(artistName);
  const safeAlbumName = sanitizeFilename(albumName);

  try {
    await fs.mkdir(baseDownloadPath, { recursive: true });
    const artistPath = path.join(baseDownloadPath, safeArtistName);
    await fs.mkdir(artistPath, { recursive: true });
    const albumPath = path.join(artistPath, safeAlbumName);
    await fs.mkdir(albumPath, { recursive: true });

    res.json({ message: 'Folder structure created successfully', path: albumPath });
  } catch (error) {
    error('Error creating folder structure:', error);
    res.status(500).json({ error: 'Failed to create folder structure.' });
  }
});

const PROXY_ALLOWLIST = new Set(['api.spotify.com', 'api.deezer.com']);

app.get('/api/proxy', proxyLimiter, async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  if (parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only HTTPS URLs are allowed.' });
  }

  if (!PROXY_ALLOWLIST.has(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host not allowed.' });
  }

  info(`Proxy request to: ${parsedUrl.hostname}${parsedUrl.pathname}`);

  const isSpotify = parsedUrl.hostname === 'api.spotify.com';
  const isDeezer  = parsedUrl.hostname === 'api.deezer.com';
  const headers = {};

  if (isSpotify) {
    if (!spotifyAccessToken) {
      return res.status(500).json({ error: 'Spotify access token not available.' });
    }
    headers['Authorization'] = `Bearer ${spotifyAccessToken}`;
  }

  try {
    const response = await fetch(url, { headers });
    const data = await response.json();

    if (response.ok) {
      if (isSpotify && data.tracks) {
        return res.json({
          items: data.tracks.items,
          next: data.tracks.next,
          previous: data.tracks.previous
        });
      } else if (isSpotify && data.items) {
        return res.json({
          items: data.items,
          next: data.next,
          previous: data.previous
        });
      } else if (isDeezer) {
        const items = (data.data || []).map(track => ({
          id: `deezer-${track.id}`,
          name: track.title,
          artists: [{ name: track.artist.name }],
          album: {
            name: track.album.title,
            images: [
              { url: track.album.cover_xl, height: 1000, width: 1000 },
              { url: track.album.cover_medium, height: 250, width: 250 },
              { url: track.album.cover_small, height: 56, width: 56 }
            ].filter(img => img.url)
          },
          isDeezer: true,
          url: track.link
        }));
        return res.json({
          items,
          next: data.next,
          previous: data.prev
        });
      }
      res.json(data);
    } else {
      error(`Proxy error from ${parsedUrl.hostname}:`, data);
      res.status(response.status).json({ error: data.error?.message || 'Error proxying request' });
    }
  } catch (err) {
    error(`Network error proxying to ${parsedUrl.hostname}:`, err);
    res.status(500).json({ error: 'Network error while proxying request' });
  }
});

app.post('/download-song', requireCsrf, downloadLimiter, async (req, res) => {
  let { trackName, artistName, albumName, albumArtUrl, year, trackNumber, genre, isYoutube, url: videoUrl } = req.body;
  info(`Download Task: "${trackName}" by "${artistName}" from album "${albumName}"`);

  if (isYoutube && (!videoUrl || !isValidYouTubeUrl(videoUrl))) {
    return res.status(400).json({ error: 'A valid HTTPS YouTube URL is required for direct downloads.' });
  }

  if (!isYoutube && (!trackName || !artistName || !albumName)) {
    return res.status(400).json({ error: 'Track name, artist name, and album name are required.' });
  }

  const baseDownloadPath = getBaseDownloadPath();
  let videoInfo = null;

  try {
    if (isYoutube && videoUrl) {
      info(`Direct Download via YouTube URL: ${videoUrl}`);
      const canonical = await resolveCanonicalYoutube(videoUrl);
      trackName = canonical.name;
      artistName = canonical.artists.map(artist => artist.name).join(', ');
      albumName = canonical.album.name;
      albumArtUrl = canonical.album.images[0]?.url;
      year = canonical.album.release_date?.substring(0, 4);
      trackNumber = canonical.trackNumber;
      genre = canonical.genre;
      videoInfo = canonical;
    } else {
      // For Spotify or Deezer, we need to find the song on YouTube
      const searchQuery = `${trackName} ${artistName}`;
      info(`Searching YouTube for: "${searchQuery}"`);
      const searchArgs = [`ytsearch1:"${searchQuery}"`, '--dump-json'];
      const searchResultJson = await runYtDlp(searchArgs);

      if (!searchResultJson) {
        error(`No YouTube results for: "${searchQuery}"`);
        return res.status(404).json({ error: 'Could not find a YouTube video for the song.' });
      }
      videoInfo = JSON.parse(searchResultJson);
      videoUrl = videoInfo.webpage_url || videoInfo.url;
    }

    if (!trackName || !artistName || !albumName) {
      return res.status(422).json({ error: 'The YouTube link did not contain enough music metadata.' });
    }

    // Final enrichment fallback for non-direct downloads. Direct YouTube metadata
    // has already passed through the shared canonical resolver above.
    let releaseDate = year;
    if (!isYoutube && (albumName === 'YouTube Music' || !year || !trackNumber || !genre)) {
        const enriched = await metadataService.enrich(artistName, trackName);
        if (albumName === 'YouTube Music' && enriched.album !== 'YouTube Music') {
            albumName = enriched.album;
        }
        if (!year) year = enriched.year;
        if (!trackNumber) trackNumber = enriched.trackNumber;
        if (!genre) genre = enriched.genre;
        if (enriched.releaseDate) releaseDate = enriched.releaseDate;
    }

    // Deezer genre fallback — search by artist+track, then hit the album endpoint
    if (!genre) {
        try {
            const q = encodeURIComponent(`artist:"${artistName}" track:"${trackName}"`);
            const searchRes = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`);
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                const albumId = searchData.data?.[0]?.album?.id;
                if (albumId) {
                    const albumRes = await fetch(`https://api.deezer.com/album/${albumId}`);
                    if (albumRes.ok) {
                        const albumData = await albumRes.json();
                        const firstGenre = albumData.genres?.data?.[0]?.name;
                        if (firstGenre) {
                            genre = firstGenre;
                            info(`Deezer genre for "${trackName}": ${genre}`);
                        } else {
                            warning(`Deezer: no genre returned for album ${albumId}`);
                        }
                    }
                } else {
                    warning(`Deezer: no search result found for "${trackName}" by "${artistName}"`);
                }
            }
        } catch (err) {
            warning(`Deezer genre lookup failed: ${err.message}`);
        }
    }

    const safeArtistName = sanitizeFilename(artistName);
    const safeAlbumName = sanitizeFilename(albumName);
    const safeTrackName = sanitizeFilename(trackName);

    const audioFormat = getAudioFormat();
    const audioFormatConfig = getAudioFormatConfig(audioFormat);

    const targetFolderPath = path.join(baseDownloadPath, safeArtistName, safeAlbumName);
    const outputFilePath = path.join(targetFolderPath, `${safeTrackName}.${audioFormatConfig.extension}`);

    if (!isWithinDirectory(baseDownloadPath, targetFolderPath) || !isWithinDirectory(baseDownloadPath, outputFilePath)) {
      return res.status(400).json({ error: 'Invalid download path.' });
    }

    // Check if the file already exists
    try {
      await fs.access(outputFilePath);
      info(`Song exists, skipping download: ${outputFilePath}`);

      // Repair missing artwork for existing files (e.g. Opus files downloaded before
      // artwork support was added). Only triggered when cover.jpg is absent, since
      // cover.jpg and ARTWORK_URL are always written together by the new code.
      if (albumArtUrl) {
        const ext = `.${audioFormatConfig.extension}`;
        const coverPath = path.join(targetFolderPath, 'cover.jpg');
        let coverMissing = false;
        try { await fs.access(coverPath); } catch { coverMissing = true; }

        if (coverMissing) {
          try {
            const artAdditions = await fetchArtworkTags(albumArtUrl, targetFolderPath, ext);
            // For non-embeddable formats (Opus): artAdditions.artworkUrl is set.
            // Write it back into the file as an ARTWORK_URL Vorbis comment so the
            // library scan can surface it as song.artworkUrl.
            if (artAdditions.artworkUrl) {
              const repairTags = {
                title: trackName,
                artist: artistName,
                album: albumName,
                year: String(year || ''),
                trackNumber: String(trackNumber || ''),
                genre: String(genre || ''),
                artworkUrl: artAdditions.artworkUrl,
              };
              await audioMetadataWriter.updateAudioMetadata(outputFilePath, repairTags).catch(e =>
                warning(`Artwork repair: metadata update failed: ${e.message}`)
              );
              refreshLibrary().catch(err => error(`Library refresh failed: ${err.message}`));
            }
          } catch (e) {
            warning(`Artwork repair failed: ${e.message}`);
          }
        }
      }

      return res.status(200).json({ status: 'exists', message: 'Song already downloaded' });
    } catch (error) {
      // File does not exist, proceed with download
    }

    try {
      await fs.mkdir(targetFolderPath, { recursive: true });
      info(`Downloading from YouTube: ${videoUrl}`);

      // Download audio using yt-dlp with the selected format
      const audioQualityPreset = getAudioQualityPreset();
      info(`Using audio format: ${audioFormat}${audioFormatConfig.supportsMp3QualityPreset ? `, quality preset: ${audioQualityPreset}` : ''}`);
      const qualityOrMetaArgs = audioFormatConfig.supportsMp3QualityPreset
        ? getYtDlpAudioQualityArgs(audioQualityPreset)
        : [];
      const downloadArgs = [
        videoUrl,
        '-x',
        ...getYtDlpAudioFormatArgs(audioFormat),
        ...qualityOrMetaArgs,
        '--output', outputFilePath,
      ];

      // Fetch lyrics in parallel with the download — both are network-bound
      const [, lyrics] = await Promise.all([
        runYtDlp(downloadArgs),
        lyricsService.fetch(artistName, trackName, albumName),
      ]);

      // Verify file exists before proceeding
      try {
        await fs.access(outputFilePath);
      } catch (err) {
        throw new Error(`File was not created at ${outputFilePath}`);
      }

      const tags = {
        title: trackName,
        artist: artistName,
        album: albumName,
        year: String(year || ''),
        trackNumber: String(trackNumber || ''),
        genre: String(genre || ''),
        releaseTime: String(releaseDate || ''),
        date: String(releaseDate || year || ''),
        originalReleaseTime: String(year || ''),
      };

      if (lyrics) {
        tags.unsynchronisedLyrics = { language: 'eng', text: lyrics };
      }

      info(`Metadata summary for "${trackName}":
  title       : ${tags.title || '—'}
  artist      : ${tags.artist || '—'}
  album       : ${tags.album || '—'}
  year        : ${tags.year || '—'}
  releaseTime : ${tags.releaseTime || '—'}
  trackNumber : ${tags.trackNumber || '—'}
  genre       : ${tags.genre || '— (not found)'}
  artwork     : ${albumArtUrl ? 'yes' : '— (not found)'}
  lyrics      : ${lyrics ? `yes (${lyrics.length} chars)` : '— (not found)'}`);

      if (albumArtUrl) {
        const dlExt = `.${audioFormatConfig.extension}`;
        const artAdditions = await fetchArtworkTags(albumArtUrl, targetFolderPath, dlExt);
        Object.assign(tags, artAdditions);
      }

      await audioMetadataWriter.writeAudioMetadata(outputFilePath, tags);

      info(`Completed download: ${outputFilePath}`);
      refreshLibrary().catch(err => error(`Library refresh failed: ${err.message}`));
      res.json({ message: 'Song downloaded and converted successfully' });
    } catch (err) {
      error(`Download failure for "${trackName}": ${err.message}`);
      res.status(500).json({ error: 'An error occurred during song download.' });
    }
  } catch (err) {
    error(`Error executing ytdlp search: ${err.message}`);
    res.status(500).json({ error: 'An error occurred during YouTube search.' });
  }
});


app.get('/config', requireSameOriginRead, (req, res) => {
  const env = process.env;
  const audioQualityPreset = getAudioQualityPreset(env.AUDIO_QUALITY_PRESET);
  const audioFormat = getAudioFormat(env.AUDIO_FORMAT);
  res.json({
    clientId: env.SPOTIFY_CLIENT_ID || '',
    hasClientSecret: !!env.SPOTIFY_CLIENT_SECRET,
    downloadPath: env.DOWNLOAD_PATH || '',
    searchProvider: env.SEARCH_PROVIDER || 'spotify',
    audioQualityPreset,
    audioQualityPresets: getAudioQualityPresetOptions(),
    audioFormat,
    audioFormats: getAudioFormatOptions(),
  });
});

// Endpoint to update environment variables
app.post('/config', requireCsrf, async (req, res) => {
  let { clientId, clientSecret, downloadPath, searchProvider, audioQualityPreset, audioFormat } = req.body;

  try {
    clientId = rejectEnvNewlines(clientId || '', 'clientId');
    clientSecret = rejectEnvNewlines(clientSecret || '', 'clientSecret');
    downloadPath = downloadPath ? rejectEnvNewlines(downloadPath, 'downloadPath') : '';
    searchProvider = rejectEnvNewlines(searchProvider || 'spotify', 'searchProvider');
    audioQualityPreset = rejectEnvNewlines(audioQualityPreset || DEFAULT_AUDIO_QUALITY_PRESET, 'audioQualityPreset');
    audioQualityPreset = validateAudioQualityPreset(audioQualityPreset);
    audioFormat = rejectEnvNewlines(audioFormat || DEFAULT_AUDIO_FORMAT, 'audioFormat');
    audioFormat = validateAudioFormat(audioFormat);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  // If clientSecret is blank the frontend is preserving the existing value
  const existingSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
  const effectiveSecret = clientSecret || existingSecret;

  if (searchProvider === 'spotify' && (!clientId || !effectiveSecret)) {
    return res.status(400).json({ error: 'Client ID and Secret are required for Spotify.' });
  }

  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (err) {
      // Ignore error if file doesn't exist
    }

    const newLines = [];
    const keysFound = { clientId: false, clientSecret: false, downloadPath: false, searchProvider: false, audioQualityPreset: false, audioFormat: false };

    envContent.split('\n').forEach(line => {
      const [key] = line.split('=');
      const trimmedKey = key ? key.trim() : '';
      if (trimmedKey === 'SPOTIFY_CLIENT_ID') {
        newLines.push(`SPOTIFY_CLIENT_ID=${clientId || ''}`);
        keysFound.clientId = true;
      } else if (trimmedKey === 'SPOTIFY_CLIENT_SECRET') {
        newLines.push(`SPOTIFY_CLIENT_SECRET=${effectiveSecret}`);
        keysFound.clientSecret = true;
      } else if (trimmedKey === 'DOWNLOAD_PATH') {
        if (downloadPath) {
            newLines.push(`DOWNLOAD_PATH=${downloadPath}`);
            keysFound.downloadPath = true;
        }
      } else if (trimmedKey === 'SEARCH_PROVIDER') {
        newLines.push(`SEARCH_PROVIDER=${searchProvider || 'spotify'}`);
        keysFound.searchProvider = true;
      } else if (trimmedKey === 'AUDIO_QUALITY_PRESET') {
        newLines.push(`AUDIO_QUALITY_PRESET=${audioQualityPreset}`);
        keysFound.audioQualityPreset = true;
      } else if (trimmedKey === 'AUDIO_FORMAT') {
        newLines.push(`AUDIO_FORMAT=${audioFormat}`);
        keysFound.audioFormat = true;
      } else if (line.trim() !== '') {
        newLines.push(line);
      }
    });

    if (!keysFound.clientId) newLines.push(`SPOTIFY_CLIENT_ID=${clientId || ''}`);
    if (!keysFound.clientSecret) newLines.push(`SPOTIFY_CLIENT_SECRET=${effectiveSecret}`);
    if (!keysFound.downloadPath && downloadPath) newLines.push(`DOWNLOAD_PATH=${downloadPath}`);
    if (!keysFound.searchProvider) newLines.push(`SEARCH_PROVIDER=${searchProvider || 'spotify'}`);
    if (!keysFound.audioQualityPreset) newLines.push(`AUDIO_QUALITY_PRESET=${audioQualityPreset}`);
    if (!keysFound.audioFormat) newLines.push(`AUDIO_FORMAT=${audioFormat}`);

    await fs.writeFile(envPath, newLines.join('\n'));

    process.env.SPOTIFY_CLIENT_ID = clientId;
    process.env.SPOTIFY_CLIENT_SECRET = effectiveSecret;
    if (downloadPath) process.env.DOWNLOAD_PATH = downloadPath;
    if (searchProvider) process.env.SEARCH_PROVIDER = searchProvider;
    process.env.AUDIO_QUALITY_PRESET = audioQualityPreset;
    process.env.AUDIO_FORMAT = audioFormat;

    if (clientId && effectiveSecret) {
      await getSpotifyAccessToken();
    }

    res.json({ message: 'Configuration saved.' });
  } catch (error) {
    error('Error writing .env file:', error);
    res.status(500).json({ error: 'Failed to save configuration.' });
  }
});

/****************************
* --- Library Endpoints ---
****************************/
app.get('/api/library', async (req, res) => {
  try {
    const library = await getLibrary();
    res.json(library);
  } catch (err) {
    error('Error fetching library:', err);
    res.status(500).json({ error: 'Failed to fetch library.' });
  }
});

app.get('/api/library/scan', scanLimiter, async (req, res) => {
  try {
    info('Scanning local library for changes...');
    const library = await refreshLibrary();
    info(`Scan complete. Found ${library.length} songs.`);
    res.json(library);
  } catch (err) {
    error('Error scanning library:', err);
    res.status(500).json({ error: 'Failed to scan library.' });
  }
});

app.get('/api/files/:id/art', async (req, res) => {
    const { id } = req.params;
    try {
        let art = await getSongArt(id);
        if (!art) {
            // Old Opus/non-MP3 files may have no embedded art, no ARTWORK_URL,
            // and no cover.jpg because they were downloaded before fallback art
            // support existed. Repair on demand when the UI asks for art.
            const library = await getLibrary();
            const song = library.find(s => s.id === id);
            if (song) {
                const artworkUrl = await lookupArtworkUrl(song);
                if (artworkUrl) {
                    const baseDownloadPath = getBaseDownloadPath();
                    const relPath = Buffer.from(id, 'base64').toString('utf-8');
                    const fullFilePath = path.join(baseDownloadPath, relPath);
                    if (isWithinDirectory(baseDownloadPath, fullFilePath)) {
                        const fileExt = path.extname(fullFilePath).toLowerCase();
                        const albumDir = path.dirname(fullFilePath);
                        const artAdditions = await fetchArtworkTags(artworkUrl, albumDir, fileExt);
                        if (Object.keys(artAdditions).length > 0) {
                            await updateSongMetadata(id, {
                                title: song.title,
                                artist: song.artist,
                                album: song.album,
                                year: song.year != null ? String(song.year) : undefined,
                                trackNumber: song.trackNumber != null ? String(song.trackNumber) : undefined,
                                genre: song.genre || undefined,
                                ...artAdditions,
                            }).catch(e => warning(`On-demand artwork metadata repair failed: ${e.message}`));
                            art = await getSongArt(id);
                        }
                    }
                }
            }
        }

        if (art) {
            res.setHeader('Content-Type', art.mime);
            res.send(art.buffer);
        } else {
            res.status(404).send('No art found');
        }
    } catch (err) {
        error('Error fetching art:', err);
        res.status(500).send('Error');
    }
});

app.put('/api/files/:id/metadata', requireCsrf, async (req, res) => {
    const { id } = req.params;
    const { title, artist, album, trackNumber, discNumber, year, releaseTime, artworkUrl, genre, comment, lyrics } = req.body;
    try {
        info(`Updating metadata for song ID: ${id}`);
        const tags = {
            title,
            artist,
            album,
            trackNumber: trackNumber != null ? String(trackNumber) : undefined,
            year: year != null ? String(year) : undefined,
            releaseTime: releaseTime || undefined,
        };
        if (discNumber !== undefined) tags.partOfSet = discNumber ? String(discNumber) : null;
        if (genre !== undefined) tags.genre = genre || null;
        if (comment !== undefined) tags.comment = comment ? { language: 'eng', text: comment } : null;
        if (lyrics !== undefined) tags.unsynchronisedLyrics = lyrics ? { language: 'eng', text: lyrics } : null;

        if (artworkUrl) {
            const baseDownloadPath = getBaseDownloadPath();
            const relPath = Buffer.from(id, 'base64').toString('utf-8');
            const fullFilePath = path.join(baseDownloadPath, relPath);
            if (isWithinDirectory(baseDownloadPath, fullFilePath)) {
                const fileExt = path.extname(fullFilePath).toLowerCase();
                const albumDir = path.dirname(fullFilePath);
                const artAdditions = await fetchArtworkTags(artworkUrl, albumDir, fileExt);
                Object.assign(tags, artAdditions);
            }
        }

        await updateSongMetadata(id, tags);
        info(`Metadata updated for: "${title}" by "${artist}"`);
        res.json({ message: 'Metadata updated successfully.' });
    } catch (err) {
        error('Error updating metadata:', err);
        res.status(500).json({ error: err.message || 'Failed to update metadata.' });
    }
});

app.post('/api/files/:id/enrich', requireCsrf, async (req, res) => {
    const { id } = req.params;
    try {
        const library = await getLibrary();
        const song = library.find(s => s.id === id);
        if (!song) return res.status(404).json({ error: 'Song not found in library.' });

        const { artist, title, album, duration } = song;

        const needsMusicBrainz = !song.year || !song.trackNumber || !song.genre ||
            !song.album || song.album === 'Unknown Album' || song.album === 'YouTube Music';
        const needsLyrics = !song.lyrics;

        if (!needsMusicBrainz && !needsLyrics) {
            return res.json({ enriched: {}, found: [] });
        }

        // Run both fetches in parallel where possible
        const [mbResult, lyricsResult] = await Promise.all([
            needsMusicBrainz ? metadataService.enrich(artist, title, album) : Promise.resolve(null),
            needsLyrics ? lyricsService.fetch(artist, title, album, duration) : Promise.resolve(null),
        ]);

        const enriched = {};
        const found = [];
        const sources = {};
        const mbContext = mbResult?.album && mbResult.album !== 'YouTube Music' ? mbResult.album : null;

        if (mbResult) {
            if (mbResult.album && mbResult.album !== 'YouTube Music' &&
                (!song.album || song.album === 'Unknown Album' || song.album === 'YouTube Music')) {
                enriched.album = mbResult.album;
                found.push('album');
                sources.album = { provider: 'MusicBrainz', context: mbContext };
            }
            if (mbResult.year && !song.year) {
                enriched.year = mbResult.year; found.push('year');
                sources.year = { provider: 'MusicBrainz', context: mbContext };
            }
            if (mbResult.trackNumber && !song.trackNumber) {
                enriched.trackNumber = mbResult.trackNumber; found.push('track number');
                sources.trackNumber = { provider: 'MusicBrainz', context: mbContext };
            }
            if (mbResult.genre && !song.genre) {
                enriched.genre = mbResult.genre; found.push('genre');
                sources.genre = { provider: 'MusicBrainz', context: mbContext };
            }
            if (mbResult.releaseDate && !song.releaseTime) {
                enriched.releaseTime = mbResult.releaseDate;
                sources.releaseTime = { provider: 'MusicBrainz', context: mbContext };
            }
        }

        if (lyricsResult) {
            enriched.lyrics = lyricsResult;
            found.push('lyrics');
            sources.lyrics = { provider: 'LRCLIB' };
        }

        info(`Enrich result for "${title}": found [${found.join(', ') || 'nothing'}]`);
        res.json({ enriched, found, sources });
    } catch (err) {
        error('Error enriching metadata:', err);
        res.status(500).json({ error: err.message || 'Failed to enrich metadata.' });
    }
});

app.post('/api/files/:id/toggle-favorite', requireCsrf, async (req, res) => {
    const { id } = req.params;
    try {
        const isLiked = await toggleFavorite(id);
        res.json({ isLiked });
    } catch (err) {
        error('Error toggling favorite:', err);
        res.status(500).json({ error: 'Failed to toggle favorite.' });
    }
});

app.post('/api/library/bulk/favorite', requireCsrf, async (req, res) => {
    const { ids, shouldLike } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids array is required' });
    }
    try {
        info(`Bulk Favorite: ${shouldLike ? 'Liking' : 'Unliking'} ${ids.length} songs.`);
        await bulkLike(ids, shouldLike);
        res.json({ success: true });
    } catch (err) {
        error('Error in bulk like:', err);
        res.status(500).json({ error: 'Failed to update favorites' });
    }
});

app.post('/api/library/bulk/delete', requireCsrf, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids array is required' });
    }
    try {
        info(`Bulk Delete: Processing ${ids.length} songs.`);
        const results = await bulkDelete(ids);
        info(`Bulk Delete complete. Success: ${results.success.length}, Failed: ${results.failed.length}`);
        res.json(results);
    } catch (err) {
        error('Error in bulk delete:', err);
        res.status(500).json({ error: 'Failed to delete songs' });
    }
});

app.get('/api/library/storage', async (req, res) => {
  const dirPath = getBaseDownloadPath();
  const getDirSize = async (dir) => {
    let total = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) total += await getDirSize(full);
        else { try { total += (await fs.stat(full)).size; } catch { /* skip */ } }
      }
    } catch { /* dir may not exist */ }
    return total;
  };
  try {
    const bytes = await getDirSize(dirPath);
    res.json({ bytes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get storage size.' });
  }
});

app.delete('/api/files/:id', requireCsrf, async (req, res) => {
  const { id } = req.params;
  try {
    info(`Deleting song with ID: ${id}`);
    await deleteSong(id);
    info('Song deleted successfully.');
    res.json({ message: 'Song deleted successfully.' });
  } catch (err) {
    error('Error deleting song:', err);
    res.status(500).json({ error: err.message || 'Failed to delete song.' });
  }
});

// Shared canvas background for dev pages (grid + bus animation)
const DEV_BG_CSS = `
  #bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
`;

const DEV_BG_HTML = `<canvas id="bg"></canvas>`;

const DEV_BG_JS = `
<script>
(function() {
  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d');
  const GRID = 40;
  const R = 20, G = 184, B = 166;
  const teal = (a) => 'rgba(' + R + ',' + G + ',' + B + ',' + a + ')';
  const MAX = 22;
  const BRANCH_CHANCE = 0.13;
  const DX = [1, -1, 0, 0];
  const DY = [0,  0, 1,-1];
  let pulses = [], W, H, cx, cy, last = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = Math.round(W / 2 / GRID) * GRID;
    cy = Math.round(H / 2 / GRID) * GRID;
  }
  window.addEventListener('resize', resize);
  resize();

  function snap(v) { return Math.round(v / GRID) * GRID; }

  function add(x, y, dir, depth) {
    if (pulses.length >= MAX || depth > 4) return;
    pulses.push({
      x, y, dir, depth,
      speed: 1.6 + Math.random() * 2.2,
      tail:  40  + Math.random() * 70,
      alpha: Math.max(0.15, 0.75 - depth * 0.15),
      cross: dir < 2 ? x : y,
      done:  false
    });
  }

  function spawn() {
    const s = 3;
    const ox = snap(cx + (Math.floor(Math.random() * (s*2+1)) - s) * GRID);
    const oy = snap(cy + (Math.floor(Math.random() * (s*2+1)) - s) * GRID);
    add(ox, oy, Math.floor(Math.random() * 4), 0);
  }

  function drawGrid() {
    ctx.lineWidth = 1;
    ctx.strokeStyle = teal(0.055);
    for (let x = 0; x <= W; x += GRID) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += GRID) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function drawPulse(p) {
    const hx = p.x, hy = p.y;
    const tx = hx - DX[p.dir] * p.tail;
    const ty = hy - DY[p.dir] * p.tail;
    const g = ctx.createLinearGradient(tx, ty, hx, hy);
    g.addColorStop(0,   teal(0));
    g.addColorStop(0.5, teal(p.alpha * 0.45));
    g.addColorStop(1,   teal(p.alpha));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    // head glow dot
    const gd = ctx.createRadialGradient(hx, hy, 0, hx, hy, 5);
    gd.addColorStop(0, teal(p.alpha));
    gd.addColorStop(1, teal(0));
    ctx.fillStyle = gd;
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
  }

  function frame(ts) {
    ctx.clearRect(0, 0, W, H);
    drawGrid();

    if (ts - last > 550) { spawn(); last = ts; }

    const branch = [];
    for (const p of pulses) {
      p.x += DX[p.dir] * p.speed;
      p.y += DY[p.dir] * p.speed;
      if (p.x > W + p.tail || p.x < -p.tail || p.y > H + p.tail || p.y < -p.tail) {
        p.done = true; continue;
      }
      const cv = p.dir < 2 ? p.x : p.y;
      const sn = snap(cv);
      if (Math.abs(sn - p.cross) >= GRID) {
        p.cross = sn;
        if (Math.random() < BRANCH_CHANCE) {
          const bdir = p.dir < 2 ? (Math.random() > .5 ? 2 : 3) : (Math.random() > .5 ? 0 : 1);
          branch.push([snap(p.x), snap(p.y), bdir, p.depth + 1]);
        }
      }
      drawPulse(p);
    }

    pulses = pulses.filter(p => !p.done);
    for (const b of branch) add(...b);
    requestAnimationFrame(frame);
  }

  for (let i = 0; i < 6; i++) spawn();
  requestAnimationFrame(frame);
})();
</script>`;

const clientDist = path.join(__dirname, '../client/dist');
const clientSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://itunes.apple.com; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';",
};
const applyClientSecurityHeaders = (res) => {
  Object.entries(clientSecurityHeaders).forEach(([key, value]) => res.setHeader(key, value));
};
if (process.env.NODE_ENV !== 'development' && existsSync(clientDist)) {
  app.use(express.static(clientDist, { setHeaders: applyClientSecurityHeaders }));
  app.get('/{*splat}', (req, res) => {
    applyClientSecurityHeaders(res);
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  info(`Serving client from ${clientDist}`);
} else {
  app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DownTune — Backend</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --tf-accent: #14b8a6;
      --sd-glass-05: rgba(255,255,255,0.05);
      --sd-glass-10: rgba(255,255,255,0.10);
      --sd-glass-15: rgba(255,255,255,0.15);
      --sd-glass-border: rgba(255,255,255,0.20);
      --sd-glass-border-soft: rgba(255,255,255,0.10);
      --sd-fg-1: rgba(255,255,255,1);
      --sd-fg-3: rgba(255,255,255,0.8);
      --sd-fg-4: rgba(255,255,255,0.6);
      --sd-shadow-lg: 0 8px 32px rgba(0,0,0,0.4);
      --sd-blur-lg: 18px;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    html, body { height: 100%; }

    body {
      font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
      color: var(--sd-fg-1);
      background-color: #080c14;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }

    ${DEV_BG_CSS}

    .card {
      position: relative;
      z-index: 1;
      background: var(--sd-glass-05);
      backdrop-filter: blur(var(--sd-blur-lg));
      border: 1px solid var(--sd-glass-border-soft);
      border-radius: 2rem;
      box-shadow: var(--sd-shadow-lg);
      padding: 2rem 2.5rem;
      max-width: 440px;
      width: calc(100% - 2rem);
      animation: fadeInUp 0.35s ease forwards;
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
      margin-bottom: 0.2rem;
    }

    .accent { color: var(--tf-accent); }

    .sub {
      font-size: 0.85rem;
      color: var(--sd-fg-4);
      margin-bottom: 1.75rem;
    }

    .rows { display: flex; flex-direction: column; gap: 0; }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--sd-glass-border-soft);
      font-size: 0.9rem;
    }
    .row:last-child { border-bottom: none; }

    .label { color: var(--sd-fg-4); }

    .value {
      color: var(--tf-accent);
      font-weight: 600;
    }

    .pill {
      background: var(--sd-glass-10);
      border: 1px solid var(--sd-glass-border);
      border-radius: 9999px;
      padding: 0.2rem 0.75rem;
      font-size: 0.8rem;
      color: var(--sd-fg-3);
    }

    a.pill {
      color: #23a6d5;
      text-decoration: none;
      transition: background 0.2s;
    }
    a.pill:hover { background: var(--sd-glass-15); }

    .footer {
      margin-top: 1.5rem;
      font-size: 0.78rem;
      color: var(--sd-fg-4);
      text-align: center;
    }
  </style>
</head>
<body>
  ${DEV_BG_HTML}
  <div class="card">
    <h1>Down<span class="accent">Tune</span></h1>
    <p class="sub">Backend API — development mode</p>
    <div class="rows">
      <div class="row">
        <span class="label">Status</span>
        <span class="pill value">running</span>
      </div>
      <div class="row">
        <span class="label">Port</span>
        <span class="pill">${port}</span>
      </div>
      <div class="row">
        <span class="label">API base</span>
        <span class="pill">/api/*</span>
      </div>
      <div class="row">
        <span class="label">Frontend</span>
        <a class="pill" href="http://localhost:5173">localhost:5173</a>
      </div>
    </div>
  </div>
  ${DEV_BG_JS}
</body>
</html>`);
  });
}

app.use((req, res) => {
  if (req.accepts('html')) {
    const escapedMethod = htmlEscape(req.method);
    const escapedPath = htmlEscape(req.path);
    applyClientSecurityHeaders(res);
    res.status(404).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 — DownTune</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --tf-accent: #14b8a6;
      --sd-glass-05: rgba(255,255,255,0.05);
      --sd-glass-10: rgba(255,255,255,0.10);
      --sd-glass-15: rgba(255,255,255,0.15);
      --sd-glass-border: rgba(255,255,255,0.20);
      --sd-glass-border-soft: rgba(255,255,255,0.10);
      --sd-fg-1: rgba(255,255,255,1);
      --sd-fg-3: rgba(255,255,255,0.8);
      --sd-fg-4: rgba(255,255,255,0.6);
      --sd-shadow-lg: 0 8px 32px rgba(0,0,0,0.4);
      --sd-blur-lg: 18px;
      --tf-accent: #14b8a6;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    html, body { height: 100%; }

    body {
      font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
      color: var(--sd-fg-1);
      background-color: #080c14;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }

    ${DEV_BG_CSS}

    .card {
      position: relative;
      z-index: 1;
      background: var(--sd-glass-05);
      backdrop-filter: blur(var(--sd-blur-lg));
      border: 1px solid var(--sd-glass-border-soft);
      border-radius: 2rem;
      box-shadow: var(--sd-shadow-lg);
      padding: 2rem 2.5rem;
      max-width: 440px;
      width: calc(100% - 2rem);
      animation: fadeInUp 0.35s ease forwards;
      text-align: center;
    }

    .code {
      font-size: 4rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
      margin-bottom: 0.5rem;
    }

    .accent { color: var(--tf-accent); }

    h2 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--sd-fg-3);
      margin-bottom: 0.5rem;
    }

    .path {
      display: inline-block;
      background: var(--sd-glass-10);
      border: 1px solid var(--sd-glass-border);
      border-radius: 9999px;
      padding: 0.2rem 0.85rem;
      font-size: 0.85rem;
      font-family: monospace;
      color: var(--sd-fg-3);
      margin-bottom: 1.5rem;
    }

    a.pill {
      display: inline-block;
      background: var(--sd-glass-10);
      border: 1px solid var(--sd-glass-border);
      border-radius: 9999px;
      padding: 0.35rem 1rem;
      font-size: 0.85rem;
      color: #23a6d5;
      text-decoration: none;
      transition: background 0.2s;
    }
    a.pill:hover { background: var(--sd-glass-15); }
  </style>
</head>
<body>
  ${DEV_BG_HTML}
  <div class="card">
    <div class="code">4<span class="accent">0</span>4</div>
    <h2>Route not found</h2>
    <div class="path">${escapedMethod} ${escapedPath}</div><br>
    <a class="pill" href="/">← Back to API status</a>
  </div>
  ${DEV_BG_JS}
</body>
</html>`);
  } else {
    res.status(404).json({ error: 'Not found', path: req.path });
  }
});

app.listen(port, () => {
  info(`Backend listening at http://localhost:${port}`);
  getSpotifyAccessToken(); // Get initial token when server starts
});
