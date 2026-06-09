import fs from 'fs/promises';
import path from 'path';
import { isSafeArtworkUrl } from '../utils/url-validator.js';
import { supportsArtworkEmbedding } from './AudioMetadataWriter.js';
import { warning, error } from '../logger.js';

/**
 * Fetches artwork from albumArtUrl (must pass isSafeArtworkUrl), saves it as
 * cover.jpg in targetFolderPath, and returns tag additions appropriate for ext.
 *
 * Embeddable formats (mp3, m4a, flac): { image: { mime, type, description, imageBuffer } }
 * Non-embeddable formats (opus):        { artworkUrl: string }
 * Unsafe URL or fetch failure:           {}
 *
 * cover.jpg is always saved on success so /api/files/:id/art can serve it.
 *
 * @param {string} albumArtUrl
 * @param {string} targetFolderPath  album directory where cover.jpg is saved
 * @param {string} ext               file extension including dot, e.g. '.opus'
 * @param {{ fetchFn?, fsMod? }}     optional injectable deps for testing
 */
export async function fetchArtworkTags(albumArtUrl, targetFolderPath, ext, {
  fetchFn = globalThis.fetch,
  fsMod = fs,
} = {}) {
  if (!isSafeArtworkUrl(albumArtUrl)) {
    warning(`Skipping unsafe albumArtUrl: ${albumArtUrl}`);
    return {};
  }
  try {
    const imageResponse = await fetchFn(albumArtUrl);
    if (!imageResponse.ok) {
      warning(`Artwork fetch failed (HTTP ${imageResponse.status}): ${albumArtUrl}`);
      return {};
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const mime = (imageResponse.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();

    // Always save cover.jpg — primary art source for Opus, redundant fallback for embeddable formats
    const coverPath = path.join(targetFolderPath, 'cover.jpg');
    await fsMod.writeFile(coverPath, imageBuffer).catch(e =>
      warning(`cover.jpg save failed: ${e.message}`)
    );

    if (!supportsArtworkEmbedding(ext)) {
      // Opus cannot embed artwork; store URL as ARTWORK_URL Vorbis comment so
      // the library scan exposes it as song.artworkUrl for direct frontend use.
      return { artworkUrl: albumArtUrl };
    }
    return {
      image: {
        mime,
        type: { id: 3, name: 'front cover' },
        description: 'Album Art',
        imageBuffer,
      },
    };
  } catch (err) {
    error(`Failed to fetch album art: ${err.message}`);
    return {};
  }
}

/**
 * Looks up a likely album-art URL from the public iTunes Search API.
 * This is used only as a fallback when a local file has no embedded art,
 * no ARTWORK_URL metadata, and no album-folder cover.jpg.
 *
 * @param {{ artist?: string, title?: string, album?: string }} song
 * @param {{ fetchFn? }} optional injectable deps for testing
 * @returns {Promise<string|null>}
 */
export async function lookupArtworkUrl(song, { fetchFn = globalThis.fetch } = {}) {
  const artist = song?.artist || '';
  const title = song?.title || '';
  const album = song?.album || '';
  const query = [artist, title, album].filter(Boolean).join(' ').trim();
  if (!query) return null;

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    const response = await fetchFn(url);
    if (!response.ok) return null;
    const data = await response.json();
    const art = data.results?.[0]?.artworkUrl100;
    if (!art) return null;
    const highRes = art.replace('100x100bb', '600x600bb');
    return isSafeArtworkUrl(highRes) ? highRes : null;
  } catch (err) {
    warning(`Artwork lookup failed for "${title}": ${err.message}`);
    return null;
  }
}
