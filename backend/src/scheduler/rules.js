const db = require('../db');

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Groups media_files rows into playback units: a multi-part group is one unit
 *  containing all its parts in order; anything else is a unit of one file. */
function buildUnits(mediaFiles) {
  const groups = new Map();
  const units = [];
  for (const file of mediaFiles) {
    if (file.group_id) {
      if (!groups.has(file.group_id)) {
        const unit = { key: `group:${file.group_id}`, groupId: file.group_id, files: [] };
        groups.set(file.group_id, unit);
        units.push(unit);
      }
      groups.get(file.group_id).files.push(file);
    } else {
      units.push({ key: `file:${file.id}`, groupId: null, files: [file] });
    }
  }
  for (const unit of units) {
    unit.files.sort((a, b) => (a.part_number ?? 0) - (b.part_number ?? 0));
  }
  return units;
}

// Files not seen in the most recent scan are excluded — they've likely been moved/renamed/
// deleted on disk, and scheduling a stale path just makes Liquidsoap fail on air.
const STALE_AFTER = "interval '2 days'";

async function fetchRuleMatches(rule) {
  if (rule.rule_type === 'folder') {
    // rule_value may be a comma-separated list of folder paths (e.g. to combine two
    // small genres like Drama+Family into one channel) as well as a single path.
    const prefixes = rule.rule_value.split(',').map((p) => `${p.trim()}%`);
    const { rows } = await db.query(
      `SELECT * FROM media_files WHERE absolute_path LIKE ANY($1) AND last_seen_at > now() - ${STALE_AFTER} ORDER BY title`,
      [prefixes]
    );
    return rows;
  }
  if (rule.rule_type === 'show') {
    const { rows } = await db.query(
      `SELECT * FROM media_files WHERE show_name = $1 AND last_seen_at > now() - ${STALE_AFTER}
       ORDER BY season NULLS LAST, episode NULLS LAST, part_number NULLS LAST`,
      [rule.rule_value]
    );
    return rows;
  }
  throw new Error(`Unknown rule_type ${rule.rule_type}`);
}

async function fetchOverrides(channelId) {
  const { rows } = await db.query('SELECT * FROM channel_overrides WHERE channel_id = $1', [channelId]);
  return rows;
}

// Excludes units that aired on this channel within the last 24h (cooldown.fileIds/groupIds,
// built by generate.js from a sliding window). Falls back to ignoring cooldown rather than
// starving a small library down to almost nothing — e.g. a 3-movie channel would otherwise
// have nowhere to go once all 3 had aired that day.
function applyCooldown(units, cooldown) {
  if (!cooldown || (cooldown.fileIds.size === 0 && cooldown.groupIds.size === 0)) return units;
  const filtered = units.filter((u) =>
    u.groupId ? !cooldown.groupIds.has(u.groupId) : !cooldown.fileIds.has(u.files[0].id)
  );
  const minViable = Math.max(1, Math.ceil(units.length * 0.2));
  return filtered.length >= minViable ? filtered : units;
}

async function resolveRuleSlot(rule, excludedFileIds, excludedGroupIds, cooldown) {
  const matches = await fetchRuleMatches(rule);
  const filtered = matches.filter(
    (f) => !excludedFileIds.has(f.id) && !(f.group_id && excludedGroupIds.has(f.group_id))
  );
  let units = buildUnits(filtered);
  units = applyCooldown(units, cooldown);
  if (rule.shuffle) units = shuffle(units);
  return units;
}

/** Resolves a channel's rule(s) (+ overrides) into an ordered list of units for one cycle.
 *  Re-shuffles each shuffled slot on every call, so successive cycles don't repeat the same
 *  order. A plain channel has one rule slot and behaves as before (flat rotation, pins
 *  supported). A "block" channel has multiple ordered slots (channel_rules.block_order) each
 *  contributing block_count units per cycle — e.g. 1 movie then 2 TV episodes, repeating —
 *  for programming-block style channels rather than one flat shuffled pool. */
async function resolveChannelUnits(channel, cooldown) {
  const { rows: ruleSlots } = await db.query(
    'SELECT * FROM channel_rules WHERE channel_id = $1 ORDER BY block_order ASC, id ASC',
    [channel.id]
  );
  if (ruleSlots.length === 0) return [];

  const overrides = await fetchOverrides(channel.id);
  const excludedFileIds = new Set(
    overrides.filter((o) => o.override_type === 'exclude' && o.media_file_id).map((o) => o.media_file_id)
  );
  const excludedGroupIds = new Set(
    overrides.filter((o) => o.override_type === 'exclude' && o.group_id).map((o) => o.group_id)
  );

  // Single-rule channel: unchanged behavior (flat rotation, pins supported).
  if (ruleSlots.length === 1) {
    let units = await resolveRuleSlot(ruleSlots[0], excludedFileIds, excludedGroupIds, cooldown);

    const pins = overrides
      .filter((o) => o.override_type === 'pin')
      .sort((a, b) => (a.pin_position ?? 0) - (b.pin_position ?? 0));

    if (pins.length) {
      const unitByFileId = new Map();
      const unitByGroupId = new Map();
      for (const unit of units) {
        if (unit.groupId) unitByGroupId.set(unit.groupId, unit);
        else unitByFileId.set(unit.files[0].id, unit);
      }
      const pinnedUnits = [];
      for (const pin of pins) {
        const unit = pin.group_id ? unitByGroupId.get(pin.group_id) : unitByFileId.get(pin.media_file_id);
        if (unit) pinnedUnits.push(unit);
      }
      const remaining = units.filter((u) => !pinnedUnits.includes(u));
      units = [...pinnedUnits, ...remaining];
    }

    return units;
  }

  // Block channel: pull block_count units from each slot in order to build one cycle.
  // Pins aren't supported here yet — positioning against an interleaved multi-pool
  // sequence isn't well-defined, so overrides only apply as excludes for block channels.
  const cycle = [];
  for (const rule of ruleSlots) {
    const units = await resolveRuleSlot(rule, excludedFileIds, excludedGroupIds, cooldown);
    if (units.length === 0) continue; // empty slot — skip rather than break the whole cycle
    const picked = [];
    while (picked.length < rule.block_count) {
      const pool = rule.shuffle ? shuffle(units) : units;
      for (const u of pool) {
        if (picked.length >= rule.block_count) break;
        picked.push(u);
      }
    }
    cycle.push(...picked);
  }

  return cycle;
}

module.exports = { resolveChannelUnits, buildUnits };
