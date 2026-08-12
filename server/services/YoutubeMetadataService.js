import { runYtDlp } from '../utils/yt-dlp-helper.js';
import { info, warning } from '../logger.js';

const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;
const cache = new Map();

const VIDEO_DECORATION = /\s*(?:(?:\[|\()(?:official\s+)?(?:music\s+)?(?:video|audio|lyric\s+video|lyrics?)(?:\]|\))|(?:official\s+)(?:music\s+)?(?:video|audio))\s*$/i;
const VERSION_WORDS = ['live', 'remix', 'acoustic', 'remaster', 'cover', 'karaoke', 'instrumental'];

export function cleanYoutubeArtist(value = '') {
  return String(value).replace(/\s*-\s*Topic$/i, '').replace(/\s*VEVO$/i, '').trim();
}

export function cleanYoutubeTitle(value = '') {
  let title = String(value).trim();
  let previous;
  do {
    previous = title;
    title = title.replace(VIDEO_DECORATION, '').trim();
  } while (title !== previous);
  return title;
}

export function parseProvidedMetadata(description = '') {
  if (!/Provided to YouTube by/i.test(description)) return null;
  const lines = String(description).split('\n').map(line => line.trim()).filter(Boolean);
  const creditLine = lines.find(line => line.includes(' · '));
  if (!creditLine) return null;
  const index = lines.indexOf(creditLine);
  const parts = creditLine.split(' · ').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    title: parts[0],
    artist: parts.slice(1).join(', '),
    album: lines[index + 1] && !/^(Released on|Provided to)/i.test(lines[index + 1])
      ? lines[index + 1]
      : undefined,
  };
}

export function extractYoutubeCandidates(videoInfo) {
  const provided = parseProvidedMetadata(videoInfo.description);
  const uploader = cleanYoutubeArtist(videoInfo.artist || videoInfo.uploader || videoInfo.channel || '');
  let title = cleanYoutubeTitle(videoInfo.track || provided?.title || videoInfo.title || 'Untitled YouTube video');
  let artist = cleanYoutubeArtist(videoInfo.artist || provided?.artist || uploader || 'Unknown Artist');

  if (!videoInfo.track && !provided && videoInfo.title) {
    const split = cleanYoutubeTitle(videoInfo.title).match(/^(.+?)\s+-\s+(.+)$/);
    if (split) {
      const prefix = cleanYoutubeArtist(split[1]);
      const uploaderNorm = normalizeText(uploader);
      const prefixWordCount = normalizeText(prefix).split(' ').filter(Boolean).length;
      // A spaced dash is YouTube's conventional Artist - Title delimiter. Keep
      // the guard bounded so prose-like video titles are not split arbitrarily.
      if (prefixWordCount > 0 && prefixWordCount <= 8 && (
        !uploaderNorm || uploaderNorm.includes(normalizeText(prefix)) ||
        normalizeText(prefix).includes(uploaderNorm) || split[2].trim().length >= 3
      )) {
        artist = prefix;
        title = cleanYoutubeTitle(split[2]);
      }
    }
  }

  return {
    title,
    artist,
    album: videoInfo.album || provided?.album || 'YouTube Music',
    releaseDate: videoInfo.release_date || undefined,
    year: String(videoInfo.release_year || videoInfo.release_date || '').slice(0, 4) || undefined,
    trackNumber: videoInfo.track_number || undefined,
    discNumber: videoInfo.disc_number || undefined,
    genre: videoInfo.genre || undefined,
    duration: Number(videoInfo.duration) || undefined,
  };
}

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/\b(feat(?:uring)?|ft)\.?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function tokenSimilarity(left, right) {
  const a = new Set(normalizeText(left).split(' ').filter(Boolean));
  const b = new Set(normalizeText(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function normalizeTitle(value) {
  return normalizeText(String(value).replace(/\s+(?:feat(?:uring)?|ft)\.?\s+.+$/i, ''));
}

function titleSimilarity(left, right) {
  const a = new Set(normalizeTitle(left).split(' ').filter(Boolean));
  const b = new Set(normalizeTitle(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function qualifierSet(value) {
  const normalized = normalizeText(value);
  return new Set(VERSION_WORDS.filter(word => normalized.includes(word)));
}

export function scoreDeezerCandidate(candidate, source) {
  const candidateTitle = candidate.title_short || candidate.title || '';
  const sourceTitle = source.title || '';
  const titleScore = titleSimilarity(candidateTitle, sourceTitle);
  const contributorNames = [candidate.artist?.name, ...(candidate.contributors || []).map(a => a.name)].filter(Boolean);
  const artistScore = Math.max(
    0,
    ...contributorNames.map(name => tokenSimilarity(name, source.artist)),
    tokenSimilarity(contributorNames.join(' '), source.artist),
  );
  if (titleScore < 0.72 || artistScore < 0.55) return 0;

  let score = titleScore * 55 + artistScore * 35;
  const sourceQualifiers = qualifierSet(sourceTitle);
  const candidateQualifiers = qualifierSet(`${candidate.title || ''} ${candidate.title_version || ''}`);
  for (const word of VERSION_WORDS) {
    if (sourceQualifiers.has(word) !== candidateQualifiers.has(word)) score -= 18;
  }
  if (source.duration && candidate.duration) {
    const difference = Math.abs(Number(candidate.duration) - Number(source.duration));
    if (difference <= 3) score += 10;
    else if (difference <= 10) score += 5;
    else if (difference > 25) score -= 15;
  }
  return Math.max(0, score);
}

export function selectDeezerMatch(candidates, source) {
  const ranked = (candidates || []).map(candidate => ({ candidate, score: scoreDeezerCandidate(candidate, source) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || ranked[0].score < 72) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < 4) return null;
  return ranked[0].candidate;
}

async function fetchJson(url, fetchFn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'API error');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichFromDeezer(source, fetchFn) {
  const query = encodeURIComponent(`artist:"${source.artist}" track:"${source.title}"`);
  const search = await fetchJson(`https://api.deezer.com/search?q=${query}&limit=10`, fetchFn);
  const match = selectDeezerMatch(search.data, source);
  if (!match) return null;

  const [track, album] = await Promise.all([
    fetchJson(`https://api.deezer.com/track/${match.id}`, fetchFn).catch(() => match),
    match.album?.id
      ? fetchJson(`https://api.deezer.com/album/${match.album.id}`, fetchFn).catch(() => match.album)
      : Promise.resolve(match.album || {}),
  ]);
  const artists = (track.contributors?.length ? track.contributors : [track.artist]).filter(Boolean).map(a => ({ name: a.name }));
  const releaseDate = album.release_date || source.releaseDate;
  return {
    name: track.title_short || track.title || source.title,
    artists: artists.length ? artists : [{ name: source.artist }],
    album: {
      name: album.title || match.album?.title || source.album,
      images: [
        { url: album.cover_xl || match.album?.cover_xl, height: 1000, width: 1000 },
        { url: album.cover_medium || match.album?.cover_medium, height: 250, width: 250 },
        { url: album.cover_small || match.album?.cover_small, height: 56, width: 56 },
      ].filter(image => image.url),
      release_date: releaseDate,
    },
    trackNumber: track.track_position || source.trackNumber,
    discNumber: track.disk_number || source.discNumber,
    genre: album.genres?.data?.[0]?.name || source.genre,
    duration: Number(track.duration) || source.duration,
    metadataSource: 'deezer',
  };
}

function youtubeFallback(videoInfo, sourceUrl, source) {
  const thumbnails = Array.isArray(videoInfo.thumbnails)
    ? videoInfo.thumbnails.slice(-2).map(t => ({ url: t.url, height: t.height, width: t.width })).filter(t => t.url)
    : [];
  return {
    id: `youtube-${videoInfo.id || Buffer.from(sourceUrl).toString('base64url')}`,
    name: source.title,
    artists: [{ name: source.artist }],
    album: { name: source.album, images: thumbnails, release_date: source.releaseDate },
    trackNumber: source.trackNumber,
    discNumber: source.discNumber,
    genre: source.genre,
    duration: source.duration,
  };
}

export function getYoutubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop() || null;
  } catch {
    return null;
  }
}

export async function resolveCanonicalYoutube(url, {
  runYtDlpFn = runYtDlp,
  fetchFn = globalThis.fetch,
  useCache = true,
} = {}) {
  const videoId = getYoutubeVideoId(url) || url;
  const cached = cache.get(videoId);
  if (useCache && cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);

  const stdout = await runYtDlpFn([url, '--dump-single-json', '--skip-download', '--no-playlist']);
  if (!stdout.trim()) throw new Error('YouTube returned no video information.');
  const videoInfo = JSON.parse(stdout);
  const source = extractYoutubeCandidates(videoInfo);
  let canonical = youtubeFallback(videoInfo, url, source);
  let cacheTtl = FAILURE_TTL_MS;
  try {
    const enriched = await enrichFromDeezer(source, fetchFn);
    if (enriched) {
      canonical = { ...canonical, ...enriched };
      cacheTtl = SUCCESS_TTL_MS;
      info(`Matched direct YouTube metadata via Deezer: ${canonical.artists[0].name} - ${canonical.name}`);
    } else {
      warning(`No confident Deezer match for direct YouTube metadata: ${source.artist} - ${source.title}`);
    }
  } catch (err) {
    warning(`Deezer metadata lookup failed for direct YouTube URL: ${err.message}`);
  }

  const result = {
    ...canonical,
    id: `youtube-${videoInfo.id || videoId}`,
    isYoutube: true,
    isDirectYoutube: true,
    url,
  };
  if (useCache) cache.set(videoId, { value: result, expiresAt: Date.now() + cacheTtl });
  return structuredClone(result);
}

export function clearYoutubeMetadataCache() {
  cache.clear();
}
