import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // Load environment variables
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path'; // Import path module
import { fileURLToPath } from 'url';
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

import { spawn } from 'child_process';
import NodeID3 from 'node-id3';
import { getLibrary, refreshLibrary, deleteSong, getSongArt, updateSongMetadata, toggleFavorite, bulkLike, bulkDelete } from './libraryManager.js';
import { runYtDlp } from './utils/yt-dlp-helper.js';
import { SpotifyProvider } from './providers/SpotifyProvider.js';
import { YoutubeMusicProvider } from './providers/YoutubeMusicProvider.js';
import { DeezerProvider } from './providers/DeezerProvider.js';
import { metadataService } from './services/MetadataService.js';
import { lyricsService } from './services/LyricsService.js';

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

// Allow CORS from the configured origin (set ALLOWED_ORIGIN in .env for production)
const corsOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

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
  
  if (type === 'deezer' || type === 'youtube') {
    return new DeezerProvider();
  }
  return new SpotifyProvider(spotifyAccessToken);
};

// Generic Search Endpoint
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const limit = parseInt(req.query.limit) || 10;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    const provider = getSearchProvider();
    const results = await provider.search(query, limit);
    res.json(results);
  } catch (err) {
    error(`Search failed using ${process.env.SEARCH_PROVIDER || 'spotify'}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Legacy Endpoint to search Spotify (kept for compatibility)
app.get('/search-spotify', async (req, res) => {
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
  return name.replace(/[/\\]/g, '_'); // Replace forward and backward slashes with underscore
};

// Endpoint to create folder structure
app.post('/create-folder-structure', async (req, res) => {
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

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  info(`Proxy request to: ${url}`);

  const isSpotify = url.includes('api.spotify.com');
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
      // Map results to unified format if it's a pagination call
      if (isSpotify && data.tracks) {
        return res.json({
          items: data.tracks.items,
          next: data.tracks.next,
          previous: data.tracks.previous
        });
      } else if (isSpotify && data.items) {
          // If it's a direct tracks page from Spotify
          return res.json({
            items: data.items,
            next: data.next,
            previous: data.previous
          });
      } else if (url.includes('api.deezer.com')) {
          // Map Deezer pagination
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
      error(`Error proxying request to ${url}:`, data);
      res.status(response.status).json({ error: data.error?.message || 'Error proxying request' });
    }
  } catch (error) {
    error(`Network error while proxying request to ${url}:`, error);
    res.status(500).json({ error: 'Network error while proxying request' });
  }
});

app.post('/download-song', async (req, res) => {
  let { trackName, artistName, albumName, albumArtUrl, year, trackNumber, genre, isYoutube, isDeezer, url: videoUrl } = req.body;
  info(`Download Task: "${trackName}" by "${artistName}" from album "${albumName}"`);

  if (!trackName || !artistName || !albumName) {
    return res.status(400).json({ error: 'Track name, artist name, and album name are required.' });
  }

  const baseDownloadPath = getBaseDownloadPath();
  let videoInfo = null;

  try {
    if (isYoutube && videoUrl) {
      info(`Direct Download via YouTube URL: ${videoUrl}`);
      // Fetch full metadata if it's YouTube and we have a placeholder album
      if (albumName === 'YouTube Music') {
          try {
              const infoJson = await runYtDlp([videoUrl, '--dump-json', '--skip-download']);
              videoInfo = JSON.parse(infoJson);
              if (videoInfo) {
                  trackName = videoInfo.track || trackName;
                  artistName = videoInfo.artist || artistName;
                  trackNumber = videoInfo.track_number || trackNumber;
                  if (videoInfo.album) albumName = videoInfo.album;
                  else if (videoInfo.description && videoInfo.description.includes('Provided to YouTube by')) {
                      const descLines = videoInfo.description.split('\n').map(l => l.trim()).filter(l => l !== '');
                      if (descLines.length >= 3 && descLines[1].includes(' \u00b7 ')) {
                          const parts = descLines[1].split(' \u00b7 ');
                          trackName = parts[0];
                          artistName = parts[1];
                          albumName = descLines[2];
                      }
                  }
                  year = videoInfo.upload_date ? videoInfo.upload_date.substring(0, 4) : year;
              }
          } catch (e) {
              warning(`Failed to fetch full metadata for YouTube URL: ${e.message}`);
          }
      }
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

    // Final enrichment fallback if album is generic or other info is missing
    let releaseDate = year;
    if (albumName === 'YouTube Music' || !year || !trackNumber || !genre) {
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

    const targetFolderPath = path.join(baseDownloadPath, safeArtistName, safeAlbumName);
    const outputFilePath = path.join(targetFolderPath, `${safeTrackName}.mp3`);

    // Check if the file already exists
    try {
      await fs.access(outputFilePath);
      info(`Song exists, skipping download: ${outputFilePath}`);
      return res.status(200).json({ status: 'exists', message: 'Song already downloaded' });
    } catch (error) {
      // File does not exist, proceed with download
    }

    try {
      await fs.mkdir(targetFolderPath, { recursive: true });
      info(`Downloading from YouTube: ${videoUrl}`);

      // Download audio and convert to MP3 using runYtDlp
      const downloadArgs = [
        videoUrl,
        '-x',
        '--audio-format', 'mp3',
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
        try {
          const imageResponse = await fetch(albumArtUrl);
          const imageBuffer = await imageResponse.arrayBuffer();
          tags.image = {
            mime: 'image/jpeg', // Assuming JPEG, but could be dynamic
            type: {
              id: 3,
              name: 'front cover'
            },
            description: 'Album Art',
            imageBuffer: Buffer.from(imageBuffer)
          };
          // info('Album art attached.');
        } catch (imageError) {
          error(`Failed to fetch album art: ${imageError.message}`);
        }
      }

      await NodeID3.Promise.write(tags, outputFilePath);
      info(`ID3 tags written for "${trackName}"`);

      info(`Completed download: ${outputFilePath}`);
      refreshLibrary().catch(err => error(`Library refresh failed: ${err.message}`));
      res.json({ message: 'Song downloaded and converted successfully', filePath: outputFilePath });
    } catch (err) {
      error(`Download failure for "${trackName}": ${err.message}`);
      res.status(500).json({ error: 'An error occurred during song download.' });
    }
  } catch (err) {
    error(`Error executing ytdlp search: ${err.message}`);
    res.status(500).json({ error: 'An error occurred during YouTube search.' });
  }
});


// Endpoint to get environment variables from '~/backend/.env'
// Structure:
// SPOTIFY_CLIENT_ID - Client ID from spotify
// SPOTIFY_CLIENT_SECRET - Client Secret from spotify
app.get('/config', async (req, res) => {
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');
    const config = {};
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        if (key.trim() === 'SPOTIFY_CLIENT_ID') config.clientId = value.trim();
        if (key.trim() === 'SPOTIFY_CLIENT_SECRET') config.clientSecret = value.trim();
        if (key.trim() === 'DOWNLOAD_PATH') config.downloadPath = value.trim();
        if (key.trim() === 'SEARCH_PROVIDER') config.searchProvider = value.trim();
      }
    });
    // Default to spotify if not set
    if (!config.searchProvider) config.searchProvider = 'spotify';
    res.json(config);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({ clientId: '', clientSecret: '', downloadPath: '', searchProvider: 'spotify' });
    } else {
      error('Error reading .env file:', error);
      res.status(500).json({ error: 'Failed to read configuration.' });
    }
  }
});

// Endpoint to update environment variables
app.post('/config', async (req, res) => {
  const { clientId, clientSecret, downloadPath, searchProvider } = req.body;
  
  if (searchProvider === 'spotify' && (!clientId || !clientSecret)) {
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
    const keysFound = { clientId: false, clientSecret: false, downloadPath: false, searchProvider: false };

    envContent.split('\n').forEach(line => {
      const [key] = line.split('=');
      const trimmedKey = key ? key.trim() : '';
      if (trimmedKey === 'SPOTIFY_CLIENT_ID') {
        newLines.push(`SPOTIFY_CLIENT_ID=${clientId || ''}`);
        keysFound.clientId = true;
      } else if (trimmedKey === 'SPOTIFY_CLIENT_SECRET') {
        newLines.push(`SPOTIFY_CLIENT_SECRET=${clientSecret || ''}`);
        keysFound.clientSecret = true;
      } else if (trimmedKey === 'DOWNLOAD_PATH') {
        if (downloadPath) {
            newLines.push(`DOWNLOAD_PATH=${downloadPath}`);
            keysFound.downloadPath = true;
        }
      } else if (trimmedKey === 'SEARCH_PROVIDER') {
        newLines.push(`SEARCH_PROVIDER=${searchProvider || 'spotify'}`);
        keysFound.searchProvider = true;
      } else if (line.trim() !== '') {
        newLines.push(line);
      }
    });

    if (!keysFound.clientId) newLines.push(`SPOTIFY_CLIENT_ID=${clientId || ''}`);
    if (!keysFound.clientSecret) newLines.push(`SPOTIFY_CLIENT_SECRET=${clientSecret || ''}`);
    if (!keysFound.downloadPath && downloadPath) newLines.push(`DOWNLOAD_PATH=${downloadPath}`);
    if (!keysFound.searchProvider) newLines.push(`SEARCH_PROVIDER=${searchProvider || 'spotify'}`);

    await fs.writeFile(envPath, newLines.join('\n'));

    process.env.SPOTIFY_CLIENT_ID = clientId;
    process.env.SPOTIFY_CLIENT_SECRET = clientSecret;
    if (downloadPath) process.env.DOWNLOAD_PATH = downloadPath;
    if (searchProvider) process.env.SEARCH_PROVIDER = searchProvider;

    if (clientId && clientSecret) {
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

app.get('/api/library/scan', async (req, res) => {
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
        const art = await getSongArt(id);
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

app.put('/api/files/:id/metadata', async (req, res) => {
    const { id } = req.params;
    const { title, artist, album, trackNumber, discNumber, year, releaseTime, artworkUrl, genre, comment, lyrics } = req.body;
    try {
        info(`Updating metadata for song ID: ${id}`);
        const tags = { title, artist, album, trackNumber, year, releaseTime };
        if (discNumber !== undefined) tags.partOfSet = discNumber ? String(discNumber) : null;
        if (genre !== undefined) tags.genre = genre || null;
        if (comment !== undefined) tags.comment = comment ? { language: 'eng', text: comment } : null;
        if (lyrics !== undefined) tags.unsynchronisedLyrics = lyrics ? { language: 'eng', text: lyrics } : null;

        if (artworkUrl) {
            try {
                const imageResponse = await fetch(artworkUrl);
                if (imageResponse.ok) {
                    const imageBuffer = await imageResponse.arrayBuffer();
                    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
                    tags.image = {
                        mime: contentType,
                        type: {
                            id: 3,
                            name: 'front cover'
                        },
                        description: 'Album Art',
                        imageBuffer: Buffer.from(imageBuffer)
                    };
                } else {
                    warning(`Failed to fetch artwork from URL: ${artworkUrl}`);
                }
            } catch (imgErr) {
                warning(`Error fetching artwork: ${imgErr.message}`);
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

app.post('/api/files/:id/toggle-favorite', async (req, res) => {
    const { id } = req.params;
    try {
        const isLiked = await toggleFavorite(id);
        res.json({ isLiked });
    } catch (err) {
        error('Error toggling favorite:', err);
        res.status(500).json({ error: 'Failed to toggle favorite.' });
    }
});

app.post('/api/library/bulk/favorite', async (req, res) => {
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

app.post('/api/library/bulk/delete', async (req, res) => {
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

app.delete('/api/files/:id', async (req, res) => {
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
if (process.env.NODE_ENV !== 'development' && existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
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
    res.status(404).send(`<!DOCTYPE html>
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
    <div class="path">${req.method} ${req.path}</div><br>
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