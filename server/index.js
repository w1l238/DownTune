import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // Load environment variables
import fs from 'fs/promises'; // Import fs.promises for async file operations
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

const app = express();
const port = 3001;

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

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

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
    let releaseDate = year; // Default to year
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

      await runYtDlp(downloadArgs);

      // Verify file exists before proceeding
      try {
        await fs.access(outputFilePath);
      } catch (err) {
        throw new Error(`File was not created at ${outputFilePath}`);
      }

      info('Injecting metadata...');

      // Inject metadata
      const tags = {
        title: trackName,
        artist: artistName,
        album: albumName,
        year: String(year || ''),
        trackNumber: String(trackNumber || ''),
        genre: String(genre || ''),
        releaseTime: String(releaseDate || ''),
        date: String(releaseDate || year || ''), // Add date for TDRC compatibility
        originalReleaseTime: String(year || '') // Add original release time
      };

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
      info('ID3 tags written successfully.');

      info(`Completed download: ${outputFilePath}`);
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
    const { title, artist, album, trackNumber, year, releaseTime, artworkUrl } = req.body;
    try {
        info(`Updating metadata for song ID: ${id}`);
        const tags = { title, artist, album, trackNumber, year, releaseTime };

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

app.listen(port, () => {
  info(`Backend listening at http://localhost:${port}`);
  getSpotifyAccessToken(); // Get initial token when server starts
});