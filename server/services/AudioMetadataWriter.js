import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { randomBytes } from 'crypto';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import NodeID3 from 'node-id3';
import { info, error as logError } from '../logger.js';

const execFileAsync = promisify(_execFile);

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.m4a', '.opus', '.flac']);

/**
 * Build ffmpeg -metadata args from a DownTune tags object.
 * Returns a flat array of ['-metadata', 'key=value', ...] pairs.
 * Omits null/undefined/empty fields. Pure function — no side effects.
 */
export function buildFfmpegMetadataArgs(tags) {
  const pairs = [];

  const add = (key, value) => {
    if (value == null) return;
    const str = String(value).trim();
    if (str === '') return;
    pairs.push('-metadata', `${key}=${str}`);
  };

  add('title', tags.title);
  add('artist', tags.artist);
  add('album', tags.album);

  // Prefer most specific date field
  const dateVal = tags.releaseTime || tags.date || tags.year;
  add('date', dateVal);

  add('track', tags.trackNumber);

  const disc = tags.partOfSet ?? tags.discNumber;
  add('disc', disc);

  add('genre', tags.genre);

  // Stored for formats that cannot embed artwork (e.g. Opus), so the
  // library scan can surface it as a fallback artwork URL.
  add('ARTWORK_URL', tags.artworkUrl);

  if (tags.comment != null) {
    if (typeof tags.comment === 'object' && tags.comment?.text) {
      add('comment', tags.comment.text);
    } else if (typeof tags.comment === 'string') {
      add('comment', tags.comment);
    }
  }

  const lyricsField = tags.unsynchronisedLyrics ?? tags.lyrics;
  if (lyricsField != null) {
    if (typeof lyricsField === 'object' && lyricsField?.text) {
      add('lyrics', lyricsField.text);
    } else if (typeof lyricsField === 'string') {
      add('lyrics', lyricsField);
    }
  }

  return pairs;
}

/**
 * Returns true if the container format supports embedded artwork via ffmpeg
 * stream attachment. Ogg/Opus cannot — ffmpeg fails with "Unsupported codec id
 * in stream" when a video stream is mapped into an Opus container.
 */
export function supportsArtworkEmbedding(ext) {
  return ext !== '.opus';
}

/**
 * Build the complete ffmpeg arg list for audio metadata writing.
 * Pure function — no side effects.
 * @param {string} inputPath    source audio file
 * @param {string} outputPath   destination temp file (same directory as input)
 * @param {object} tags         DownTune tags object
 * @param {string|null} artworkPath  path to a temp artwork file, or null
 */
export function buildFfmpegArgs(inputPath, outputPath, tags, artworkPath) {
  const ext = path.extname(inputPath).toLowerCase();
  // Opus/Ogg cannot embed artwork via stream attachment — ignore artworkPath
  const effectiveArtwork = supportsArtworkEmbedding(ext) ? artworkPath : null;

  const args = ['-y', '-i', inputPath];

  if (effectiveArtwork) {
    args.push('-i', effectiveArtwork);
  }

  args.push('-map', '0:a');

  if (effectiveArtwork) {
    args.push('-map', '1:v');
    args.push('-c:a', 'copy');
    args.push('-c:v', 'copy');
    args.push('-disposition:v:0', 'attached_pic');
  } else {
    args.push('-c:a', 'copy');
  }

  // Strip all existing metadata, then inject DownTune metadata
  args.push('-map_metadata', '-1');
  args.push(...buildFfmpegMetadataArgs(tags));
  args.push(outputPath);

  return args;
}

export class AudioMetadataWriter {
  constructor({
    nodeId3 = NodeID3,
    execFileFn = execFileAsync,
    fsMod = fs,
    tmpDir = os.tmpdir(),
  } = {}) {
    this._nodeId3 = nodeId3;
    this._execFile = execFileFn;
    this._fs = fsMod;
    this._tmpDir = tmpDir;
  }

  /**
   * Write metadata to an audio file after download.
   * MP3: NodeID3.write (overwrites all ID3 tags).
   * M4A/Opus/FLAC: ffmpeg remux, atomically replacing the original.
   */
  async writeAudioMetadata(filePath, tags) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported audio format for metadata writing: "${ext}"`);
    }
    if (ext === '.mp3') {
      await this._nodeId3.Promise.write(tags, filePath);
      info(`ID3 tags written for "${path.basename(filePath)}"`);
      return;
    }
    await this._writeFfmpegMetadata(filePath, tags, 'write');
  }

  /**
   * Update metadata on an existing audio file.
   * MP3: NodeID3.update (merges tags into existing ID3).
   * M4A/Opus/FLAC: ffmpeg remux (replaces all container metadata).
   */
  async updateAudioMetadata(filePath, tags) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported audio format for metadata update: "${ext}"`);
    }
    if (ext === '.mp3') {
      await this._nodeId3.Promise.update(tags, filePath);
      info(`ID3 tags updated for "${path.basename(filePath)}"`);
      return;
    }
    await this._writeFfmpegMetadata(filePath, tags, 'update');
  }

  async _writeFfmpegMetadata(filePath, tags, mode) {
    const ext = path.extname(filePath).toLowerCase();
    const rand = randomBytes(8).toString('hex');
    // Temp output is in the same directory as the input to guarantee same-filesystem rename
    const tmpOutput = path.join(path.dirname(filePath), `.downtune-meta-${rand}${ext}`);
    let tmpArtwork = null;

    try {
      // Opus/Ogg cannot embed artwork; skip temp file creation to avoid a
      // failing ffmpeg invocation that would discard text metadata too.
      if (tags.image?.imageBuffer && supportsArtworkEmbedding(ext)) {
        const artExt = tags.image.mime === 'image/png' ? '.png' : '.jpg';
        tmpArtwork = path.join(this._tmpDir, `downtune-art-${rand}${artExt}`);
        await this._fs.writeFile(tmpArtwork, tags.image.imageBuffer);
      }

      const args = buildFfmpegArgs(filePath, tmpOutput, tags, tmpArtwork);
      info(`ffmpeg metadata ${mode}: "${path.basename(filePath)}" (${ext})`);

      await this._execFile('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });

      // Atomic replace — only touches the original after ffmpeg succeeds
      await this._fs.rename(tmpOutput, filePath);
      info(`Metadata ${mode} complete: "${path.basename(filePath)}"`);
    } catch (err) {
      logError(`ffmpeg metadata ${mode} failed for "${path.basename(filePath)}": ${err.message}`);
      throw err;
    } finally {
      if (tmpArtwork) await this._fs.unlink(tmpArtwork).catch(() => {});
      // No-op if rename already moved tmpOutput to filePath
      await this._fs.unlink(tmpOutput).catch(() => {});
    }
  }
}

export const audioMetadataWriter = new AudioMetadataWriter();
