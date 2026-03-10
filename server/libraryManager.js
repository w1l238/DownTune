import fs from 'fs/promises';
import path from 'path';
import { parseFile } from 'music-metadata';
import { fileURLToPath } from 'url';
import NodeID3 from 'node-id3';
import { info, error } from './logger.js';
import pLimit from 'p-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get base download directory
const getDownloadsDir = () => {
    return process.env.DOWNLOAD_PATH || path.join(__dirname, '..', 'downloads');
};

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
            } else if (entry.isFile() && entry.name.endsWith('.mp3')) {
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
        info(`Found ${files.length} MP3 files. Starting parallel metadata parsing (concurrency: 10)...`);
        
        // Use p-limit to control concurrency (e.g., 10 concurrent parsers)
        const limit = pLimit(10);
        let processedCount = 0;
        
        const tasks = files.map(filePath => limit(async () => {
            try {
                const metadata = await parseFile(filePath);
                const relPath = path.relative(downloadsDir, filePath);
                
                // Construct a unique ID (relative path is good enough for file system based)
                const id = Buffer.from(relPath).toString('base64');

                processedCount++;
                if (processedCount % 50 === 0 || processedCount === files.length) {
                    info(`Progress: ${processedCount}/${files.length} files parsed...`);
                }

                return {
                    id: id,
                    path: relPath, // Store relative path for security/portability
                    title: metadata.common.title || path.basename(filePath, '.mp3'),
                    artist: metadata.common.artist || 'Unknown Artist',
                    album: metadata.common.album || 'Unknown Album',
                    duration: metadata.format.duration || 0, // Duration in seconds
                    year: metadata.common.year || null,
                };
            } catch (err) {
                error(`Failed to parse metadata for ${filePath}: ${err.message}`);
                return null;
            }
        }));

        const results = await Promise.all(tasks);
        const songs = results.filter(song => song !== null);
        
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
        if (!fullPath.startsWith(downloadsDir)) {
            throw new Error('Invalid path');
        }

        await fs.unlink(fullPath);
        
        // Remove from cache
        libraryCache = libraryCache.filter(s => s.id !== id);
        
        // Optional: Try to remove empty parent directories
        const albumDir = path.dirname(fullPath);
        try {
            const albumFiles = await fs.readdir(albumDir);
            if (albumFiles.length === 0) {
                await fs.rmdir(albumDir); // remove album folder if empty
                
                // Check if artist folder is empty and remove it if so
                const artistDir = path.dirname(albumDir);
                
                // Safety check: Ensure we are not deleting the root downloads directory
                // and that the artist directory is actually a subdirectory of downloadsDir
                if (artistDir !== downloadsDir && artistDir.startsWith(downloadsDir)) {
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
        if (!fullPath.startsWith(downloadsDir)) return null;

        const metadata = await parseFile(fullPath);
        const picture = metadata.common.picture && metadata.common.picture[0];

        if (picture) {
            return {
                buffer: picture.data,
                mime: picture.format
            };
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
        if (!fullPath.startsWith(downloadsDir)) throw new Error('Invalid path');

        // Write tags
        await NodeID3.Promise.update(tags, fullPath);
        
        // Clear cache so it rescans on next get
        libraryCache = [];
        return true;
    } catch (err) {
        error(`Error updating metadata: ${err.message}`);
        throw err;
    }
}