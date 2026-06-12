const PRIVATE_IPv4 = [
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
];

const LOCAL_TLD = /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp)$/i;

/**
 * Returns true only if the URL is http/https and not a private/loopback address.
 * Use before server-side artwork fetches to prevent SSRF.
 */
export function isSafeArtworkUrl(urlStr) {
  if (!urlStr) return false;
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const hostname = parsed.hostname;
  if (!hostname) return false;
  if (/^localhost$/i.test(hostname)) return false;
  if (hostname === '[::1]') return false;
  if (PRIVATE_IPv4.some(re => re.test(hostname))) return false;
  if (LOCAL_TLD.test(hostname)) return false;
  return true;
}
