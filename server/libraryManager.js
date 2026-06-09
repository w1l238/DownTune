import fs from 'fs/promises';
import path from 'path';
import { parseFile } from 'music-metadata';
import { fileURLToPath } from 'url';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { info, error } from './logger.js';
import { audioMetadataWriter } from './services/AudioMetadataWriter.js';
import pLimit from 'p-limit';
import { isWithinDirectory } from './utils/path-helper.js';

const execFileAsync = promisify(_execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.opus', '.flac']);

// Helper to get base download directory
const getDownloadsDir = () => {
    return process.env.DOWNLOAD_PATH || path.join(__dirname, '..', 'downloads');
};

/**
 * Returns audio duration in seconds via ffprobe. Falls back to 0 on any error.
 * Used when music-metadata returns undefined/0 for a file.
 */
export async function probeDuration(filePath) {
    try {
        const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            filePath,
        ], { maxBuffer: 1024 * 1024 });
        const probeInfo = JSON.parse(stdout);
        const dur = parseFloat(probeInfo.format?.duration);
        return Number.isFinite(dur) ? dur : 0;
    } catch {
        return 0;
    }
}

const favoritesPath = path.join(__dirname, 'favorites.json');
let favorites = new Set();

// Load favorites on startup
(async () => {
    try {
        const data = await fs.readFile(favoritesPath, 'utf-8');
        favorites = new Set(JSON.parse(data));
    } catch (e) {
        // favorites file might not exist yet
    }
})();

async function saveFavorites() {
    try {
        await fs.writeFile(favoritesPath, JSON.stringify([...favorites], null, 2));
    } catch (e) {
        error(`Error saving favorites: ${e.message}`);
    }
}

export async function toggleFavorite(id) {
    if (favorites.has(id)) {
        favorites.delete(id);
    } else {
        favorites.add(id);
    }
    await saveFavorites();
    return favorites.has(id);
}

/**
 * Updates favorite status for multiple IDs.
 * @param {string[]} ids 
 * @param {boolean} shouldLike 
 */
export async function bulkLike(ids, shouldLike) {
    ids.forEach(id => {
        if (shouldLike) favorites.add(id);
        else favorites.delete(id);
    });
    await saveFavorites();
    return true;
}

let libraryCache = [];
let isScanning = false;

function firstTextValue(value) {
    if (value == null) return null;
    if (typeof value === 'string') return value || null;
    if (typeof value === 'object' && typeof value.text === 'string') return value.text || null;
    return null;
}

export function getNativeTagValue(metadata, tagNames) {
    const wanted = new Set(tagNames.map(name => name.toUpperCase()));
    for (const tags of Object.values(metadata.native || {})) {
        if (!Array.isArray(tags)) continue;
        for (const tag of tags) {
            if (wanted.has(String(tag.id || '').toUpperCase())) {
                return firstTextValue(tag.value);
            }
        }
    }
    return null;
}

export function extractComment(metadata) {
    const commonComment = metadata.common?.comment?.[0];
    return firstTextValue(commonComment)
        || getNativeTagValue(metadata, ['DESCRIPTION', 'COMMENT'])
        || null;
}

export function extractLyrics(metadata) {
    const commonLyrics = metadata.common?.lyrics?.[0];
    return firstTextValue(commonLyrics)
        || getNativeTagValue(metadata, ['LYRICS', 'UNSYNCEDLYRICS'])
        || null;
}

/**
 * Recursively scans a directory for files.
 * @param {string} dir 
 * @returns {Promise<string[]>} List of file paths
 */
async function getFilesRecursively(dir) {
    let results = [];
    try {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of list) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results = results.concat(await getFilesRecursively(fullPath));
            } else if (entry.isFile() && SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                results.push(fullPath);
            }
        }
    } catch (err) {
        // If directory doesn't exist or other error, return empty
        if (err.code !== 'ENOENT') error(`Error scanning ${dir}: ${err.message}`);
    }
    return results;
}

/**
 * Scans the downloads folder and updates the cache.
 */
export async function refreshLibrary() {
    if (isScanning) return libraryCache.map(song => ({ ...song, isLiked: favorites.has(song.id) }));
    isScanning = true;
    const startTime = Date.now();
    info('Starting library scan...');

    try {
        const downloadsDir = getDownloadsDir();
        const files = await getFilesRecursively(downloadsDir);
        info(`Found ${files.length} audio files. Starting parallel metadata parsing (concurrency: 10)...`);
        
        // Use p-limit to control concurrency (e.g., 10 concurrent parsers)
        const limit = pLimit(10);
        let processedCount = 0;
        
        const tasks = files.map(filePath => limit(async () => {
            try {
                const [metadata, stat] = await Promise.all([
                    parseFile(filePath),
                    fs.stat(filePath),
                ]);
                const relPath = path.relative(downloadsDir, filePath);

                // Construct a unique ID (relative path is good enough for file system based)
                const id = Buffer.from(relPath).toString('base64');

                processedCount++;
                if (processedCount % 50 === 0 || processedCount === files.length) {
                    info(`Progress: ${processedCount}/${files.length} files parsed...`);
                }

                // music-metadata can return undefined duration for some Opus/container
                // variants; ffprobe is more reliable for structural duration data.
                const rawDuration = metadata.format.duration;
                const duration = rawDuration > 0
                    ? rawDuration
                    : await probeDuration(filePath);

                // Artwork URL stored as a Vorbis comment for formats that can't
                // embed artwork (e.g. Opus). Used by the frontend as a fallback
                // before hitting /api/files/:id/art.
                const artworkUrl = getNativeTagValue(metadata, ['ARTWORK_URL']) || null;

                return {
                    id: id,
                    path: relPath,
                    title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
                    artist: metadata.common.artists?.join('/') || metadata.common.artist || 'Unknown Artist',
                    album: metadata.common.album || 'Unknown Album',
                    duration,
                    artworkUrl,
                    year: metadata.common.year || null,
                    releaseTime: metadata.common.releasedate || metadata.common.date || null,
                    trackNumber: metadata.common.track?.no != null ? String(metadata.common.track.no) : null,
                    discNumber: metadata.common.disk?.no || null,
                    genre: metadata.common.genre?.[0] || null,
                    comment: extractComment(metadata),
                    lyrics: extractLyrics(metadata),
                    addedAt: stat.mtime.getTime(),
                    size: stat.size,
                    fileFormat: path.extname(filePath).slice(1).toLowerCase(),
                };
            } catch (err) {
                error(`Failed to parse metadata for ${filePath}: ${err.message}`);
                return null;
            }
        }));

        const results = await Promise.all(tasks);
        const songs = results.filter(song => song !== null);
        songs.sort((a, b) => a.addedAt - b.addedAt);

        libraryCache = songs;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        info(`Library scan complete. Found ${songs.length} songs. Took ${duration}s.`);
    } catch (err) {
        error(`Library scan failed: ${err.message}`);
        throw err;
    } finally {
        isScanning = false;
    }
    return libraryCache.map(song => ({ ...song, isLiked: favorites.has(song.id) }));
}

/**
 * Returns the cached library. Starts a scan if empty.
 */
export async function getLibrary() {
    if (libraryCache.length === 0 && !isScanning) {
        await refreshLibrary();
    }
    return libraryCache.map(song => ({ ...song, isLiked: favorites.has(song.id) }));
}

/**
 * Deletes a song by its ID (base64 encoded relative path).
 * @param {string} id 
 */
export async function deleteSong(id) {
    try {
        const downloadsDir = getDownloadsDir();
        const relPath = Buffer.from(id, 'base64').toString('utf-8');
        const fullPath = path.join(downloadsDir, relPath);

        // Security check: ensure the resolved path is still inside downloads dir
        if (!isWithinDirectory(downloadsDir, fullPath)) {
            throw new Error('Invalid path');
        }

        await fs.unlink(fullPath);
        
        // Remove from cache
        libraryCache = libraryCache.filter(s => s.id !== id);
        
        // Optional: Try to remove empty parent directories
        const albumDir = path.dirname(fullPath);
        try {
            const albumFiles = await fs.readdir(albumDir);
            // Check if any audio files remain in the album directory
            const remainingAudio = albumFiles.filter(
                f => SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase())
            );
            if (remainingAudio.length === 0) {
                // Clean up cover.jpg saved during download before removing the directory
                await fs.unlink(path.join(albumDir, 'cover.jpg')).catch(() => {});
                await fs.rmdir(albumDir).catch(() => {}); // succeeds when dir is now empty

                // Check if artist folder is empty and remove it if so
                const artistDir = path.dirname(albumDir);

                // Safety check: Ensure we are not deleting the root downloads directory
                // and that the artist directory is actually a subdirectory of downloadsDir
                if (artistDir !== downloadsDir && isWithinDirectory(downloadsDir, artistDir)) {
                    const artistFiles = await fs.readdir(artistDir);
                    if (artistFiles.length === 0) {
                        await fs.rmdir(artistDir);
                    }
                }
            }
        } catch (e) { /* ignore cleanup errors */ }

        return true;
    } catch (err) {
        error(`Error deleting file: ${err.message}`);
        throw err;
    }
}

/**
 * Deletes multiple songs by their IDs.
 * @param {string[]} ids 
 */
export async function bulkDelete(ids) {
    const results = { success: [], failed: [] };
    for (const id of ids) {
        try {
            await deleteSong(id);
            results.success.push(id);
        } catch (err) {
            results.failed.push({ id, error: err.message });
        }
    }
    return results;
}

/**
 * extracts album art from a song.
 * @param {string} id 
 * @returns {Promise<{buffer: Buffer, mime: string}|null>}
 */
export async function getSongArt(id) {
    try {
        const downloadsDir = getDownloadsDir();
        const relPath = Buffer.from(id, 'base64').toString('utf-8');
        const fullPath = path.join(downloadsDir, relPath);

        // Security check
        if (!isWithinDirectory(downloadsDir, fullPath)) return null;

        // Try embedded artwork first (MP3/M4A/FLAC have it; Opus does not).
        let picture = null;
        try {
            const metadata = await parseFile(fullPath);
            picture = metadata.common.picture?.[0] ?? null;
        } catch {
            // parseFile failed (corrupt/unsupported file); fall through to cover.jpg
        }

        if (picture) {
            return { buffer: picture.data, mime: picture.format };
        }

        // Fallback: cover.jpg saved in the album directory during download.
        const albumDir = path.dirname(fullPath);
        if (isWithinDirectory(downloadsDir, albumDir)) {
            const coverPath = path.join(albumDir, 'cover.jpg');
            try {
                const coverBuf = await fs.readFile(coverPath);
                return { buffer: coverBuf, mime: 'image/jpeg' };
            } catch {
                // no cover.jpg
            }
        }

        return null;
    } catch (err) {
        error(`Error extracting art: ${err.message}`);
        return null;
    }
}

/**
 * Updates the ID3 metadata of a song.
 * @param {string} id 
 * @param {object} tags 
 */
export async function updateSongMetadata(id, tags) {
    try {
        const downloadsDir = getDownloadsDir();
        const relPath = Buffer.from(id, 'base64').toString('utf-8');
        const fullPath = path.join(downloadsDir, relPath);

        // Security check
        if (!isWithinDirectory(downloadsDir, fullPath)) throw new Error('Invalid path');

        await audioMetadataWriter.updateAudioMetadata(fullPath, tags);

        // Clear cache so it rescans on next get
        libraryCache = [];
        return true;
    } catch (err) {
        error(`Error updating metadata: ${err.message}`);
        throw err;
    }
}