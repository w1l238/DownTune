import path from 'path';

/**
 * Returns true if `target` resolves to a path strictly inside `base`.
 * Safer than startsWith — avoids false positives like /downloads vs /downloads_evil.
 */
export function isWithinDirectory(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedBase) return true;
  const rel = path.relative(resolvedBase, resolvedTarget);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}
