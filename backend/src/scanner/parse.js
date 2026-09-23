const SEASON_ONLY_PATTERNS = [/\bS(\d{1,2})(?!\d)/i, /\bSeason\s*(\d{1,3})\b/i];
// "ShowName S01E02 Title", "ShowName - 1x02 - Title" — captures a leading show-name prefix.
const NAMED_EPISODE_PATTERNS = [
  /^(.*?)[\s._-]*S(\d{1,2})E(\d{1,3})\b/i,
  /^(.*?)[\s._-]*\b(\d{1,2})x(\d{1,3})\b/i,
];
// Common aspect-ratio tags that look identical to the "1x02" episode pattern (e.g. "16X9").
const ASPECT_RATIO_TOKENS = new Set(['4x3', '16x9', '16x10', '21x9', '3x2']);
// Multi-part naming: "...Pt1", "...Part 2 of 6", "E01a"/"E01b"
const PART_PATTERNS = [
  { re: /\bPt\.?\s*(\d+)\b/i },
  { re: /\bPart\s*(\d+)(?:\s*of\s*\d+)?\b/i },
  { re: /\bS\d{1,2}E\d{1,3}([a-h])\b/i, letter: true },
];

function cleanTitle(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSeasonOnly(text) {
  for (const p of SEASON_ONLY_PATTERNS) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function parsePart(text) {
  for (const { re, letter } of PART_PATTERNS) {
    const m = text.match(re);
    if (m) {
      if (letter) return m[1].toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0) + 1;
      return parseInt(m[1], 10);
    }
  }
  return null;
}

/**
 * Detects TV episodes structurally (season/SxxEyy markers) rather than by a fixed
 * folder name, so it doesn't matter whether shows live under a dedicated "Tv" root
 * or directly inside genre folders alongside movies.
 *
 * segments: path segments relative to a media root, e.g.
 *   ['Comedy', 'Burn Notice', 'Burn Notice S01 (352p re-dvdrip)', 'Burn Notice S01E03.mkv']
 *   ['Comedy', 'SomeShow', 'SomeShow S02E05 Title.mp4']  (no season subfolder)
 *   ['Action', 'Apollo13.mp4']
 */
function parseMediaPath(segments) {
  const filename = segments[segments.length - 1];
  const filenameNoExt = cleanTitle(filename);
  const dirSegments = segments.slice(0, -1);
  const lastDir = dirSegments[dirSegments.length - 1] || null;
  const searchText = [...dirSegments, filenameNoExt].join(' / ');

  for (const pattern of NAMED_EPISODE_PATTERNS) {
    const m = filenameNoExt.match(pattern);
    if (m) {
      if (ASPECT_RATIO_TOKENS.has(`${m[2]}x${m[3]}`.toLowerCase())) continue;
      const prefixName = cleanTitle(m[1]);
      const showName = prefixName || (lastDir ? cleanTitle(lastDir.replace(SEASON_ONLY_PATTERNS[0], '').replace(SEASON_ONLY_PATTERNS[1], '')) : null);
      return {
        kind: 'episode',
        title: filenameNoExt,
        show_name: showName,
        season: parseInt(m[2], 10),
        episode: parseInt(m[3], 10),
        part_number: parsePart(searchText),
      };
    }
  }

  // No SxxEyy in the filename, but a season-only folder (e.g. "Season 1") means this is
  // still an episode — just missing an explicit episode number in the name.
  if (lastDir && matchSeasonOnly(lastDir) != null) {
    const showName = dirSegments.length >= 2 ? cleanTitle(dirSegments[dirSegments.length - 2]) : null;
    return {
      kind: 'episode',
      title: filenameNoExt,
      show_name: showName,
      season: matchSeasonOnly(lastDir),
      episode: null,
      part_number: parsePart(searchText),
    };
  }

  return {
    kind: 'movie',
    title: filenameNoExt,
    show_name: null,
    season: null,
    episode: null,
    part_number: null,
  };
}

module.exports = { parseMediaPath, cleanTitle };
