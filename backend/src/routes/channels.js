const express = require('express');
const db = require('../db');
const config = require('../config');
const { popNext } = require('../scheduler/next');
const { extendChannelSchedule } = require('../scheduler/generate');
const { getChannelEpg, getAllChannelsEpg, getAllChannelsXmltv } = require('../scheduler/epg');
const liquidsoap = require('../liquidsoap/processManager');

const router = express.Router();

// Declared before the /:id routes so "playlist.m3u8" isn't swallowed as an :id.
// Some IPTV apps insist on a literal .m3u extension even though the format is identical
// to .m3u8, so both are served from the same handler.
router.get(['/playlist.m3u8', '/playlist.m3u'], async (req, res) => {
  const { rows: channels } = await db.query('SELECT * FROM channels WHERE is_active = true ORDER BY number');
  const lines = [`#EXTM3U url-tvg="${config.publicBaseUrl}/api/channels/epg.xml"`];
  for (const channel of channels) {
    lines.push(`#EXTINF:-1 tvg-chno="${channel.number}" tvg-id="nexus-${channel.number}" tvg-name="${channel.name}",${channel.name}`);
    lines.push(`${config.publicBaseUrl}/streams/${channel.number}/stream.m3u8`);
  }
  res.type('audio/x-mpegurl').send(lines.join('\n') + '\n');
});

// XMLTV EPG feed, matched to the playlist's tvg-id values ("nexus-<number>") so IPTV
// player apps (which typically want a separate XMLTV EPG URL, not the JSON /epg/all route)
// can show program info.
router.get('/epg.xml', async (req, res) => {
  const xml = await getAllChannelsXmltv(req.query.hours ? Number(req.query.hours) : 24);
  res.type('application/xml').send(xml);
});

async function getChannelOr404(req, res) {
  const { rows } = await db.query('SELECT * FROM channels WHERE id = $1', [req.params.id]);
  if (!rows[0]) {
    res.status(404).json({ error: 'channel not found' });
    return null;
  }
  return rows[0];
}

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM channels ORDER BY number');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { number, name, description } = req.body;
  const { rows } = await db.query(
    'INSERT INTO channels (number, name, description) VALUES ($1, $2, $3) RETURNING *',
    [number, name, description || null]
  );
  res.status(201).json(rows[0]);
});

router.get('/:id', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  const { rows: rules } = await db.query('SELECT * FROM channel_rules WHERE channel_id = $1', [channel.id]);
  const { rows: overrides } = await db.query('SELECT * FROM channel_overrides WHERE channel_id = $1', [channel.id]);
  res.json({ ...channel, rules, overrides, ...liquidsoap.status(channel) });
});

router.patch('/:id', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  const { name, description, is_active } = req.body;
  const { rows } = await db.query(
    `UPDATE channels SET name = COALESCE($1, name), description = COALESCE($2, description), is_active = COALESCE($3, is_active)
     WHERE id = $4 RETURNING *`,
    [name, description, is_active, channel.id]
  );
  res.json(rows[0]);
});

// Single rule — this replaces all existing rules with just this one. For a "block"
// programming channel (multiple rotating content pools, e.g. a movie then 2 TV episodes),
// use PUT /:id/blocks instead.
router.put('/:id/rule', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  const { rule_type, rule_value, shuffle } = req.body;
  if (!['folder', 'show'].includes(rule_type)) {
    return res.status(400).json({ error: "rule_type must be 'folder' or 'show'" });
  }
  try {
    const rule = await db.transaction(async () => {
      await db.query('DELETE FROM channel_rules WHERE channel_id = $1', [channel.id]);
      const { rows } = await db.query(
        'INSERT INTO channel_rules (channel_id, rule_type, rule_value, shuffle) VALUES ($1, $2, $3, $4) RETURNING *',
        [channel.id, rule_type, rule_value, !!shuffle]
      );
      return rows[0];
    });
    await extendChannelSchedule(channel, { regenerateFromNow: true });
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Block programming: an ordered list of rule "slots", each contributing `count` units per
// rotation cycle (e.g. [{..., count: 1} /* movie */, {..., count: 2} /* 2 TV episodes */]
// repeats as movie, ep, ep, movie, ep, ep, ...). Replaces all existing rules for the channel.
router.put('/:id/blocks', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  const { blocks } = req.body;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: 'blocks must be a non-empty array' });
  }
  for (const b of blocks) {
    if (!['folder', 'show'].includes(b.rule_type)) {
      return res.status(400).json({ error: "each block's rule_type must be 'folder' or 'show'" });
    }
  }
  try {
    const inserted = await db.transaction(async () => {
      await db.query('DELETE FROM channel_rules WHERE channel_id = $1', [channel.id]);
      const results = [];
      for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i];
        const { rows } = await db.query(
          `INSERT INTO channel_rules (channel_id, rule_type, rule_value, shuffle, block_order, block_count)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [channel.id, b.rule_type, b.rule_value, !!b.shuffle, i, Number(b.count) > 0 ? Number(b.count) : 1]
        );
        results.push(rows[0]);
      }
      return results;
    });
    await extendChannelSchedule(channel, { regenerateFromNow: true });
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/overrides', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  const { media_file_id, group_id, override_type, pin_position } = req.body;
  if (!['pin', 'exclude'].includes(override_type)) {
    return res.status(400).json({ error: "override_type must be 'pin' or 'exclude'" });
  }
  const { rows } = await db.query(
    `INSERT INTO channel_overrides (channel_id, media_file_id, group_id, override_type, pin_position)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [channel.id, media_file_id || null, group_id || null, override_type, pin_position || null]
  );
  await extendChannelSchedule(channel, { regenerateFromNow: true });
  res.status(201).json(rows[0]);
});

router.delete('/:id/overrides/:overrideId', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  await db.query('DELETE FROM channel_overrides WHERE id = $1 AND channel_id = $2', [req.params.overrideId, channel.id]);
  await extendChannelSchedule(channel, { regenerateFromNow: true });
  res.status(204).end();
});

router.get('/:id/epg', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  res.json(await getChannelEpg(channel.id, req.query.hours ? Number(req.query.hours) : 24));
});

router.get('/epg/all', async (req, res) => {
  res.json(await getAllChannelsEpg(req.query.hours ? Number(req.query.hours) : 24));
});

// Called by the channel's Liquidsoap process (request.dynamic) for the next file to play.
// Plain text response: the absolute file path, or empty body if nothing is scheduled yet.
// When a nightly/graceful stop has been requested, this is also where it actually happens:
// Liquidsoap only calls here once it's ready for a new item, so returning nothing (rather
// than killing the process the instant the flag is set) lets the current item finish
// on its own instead of cutting it off mid-playback.
router.get('/:id/next-file', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  if (channel.stop_after_current) {
    res.type('text/plain').send('');
    await db.query('UPDATE channels SET stop_after_current = false WHERE id = $1', [channel.id]);
    await db.query('DELETE FROM channel_schedule WHERE channel_id = $1', [channel.id]);
    // Liquidsoap asks for the next item slightly ahead of the current one actually ending
    // (prefetch), so give the tail end of the current item a little room to actually play
    // out over HLS before killing the process.
    setTimeout(() => {
      liquidsoap.stop(channel).catch((err) => console.error(`Scheduled stop failed for channel ${channel.id}:`, err));
    }, 30000);
    return;
  }
  const next = await popNext(channel.id);
  res.type('text/plain').send(next ? next.path : '');
});

// Nightly on/off schedule (cron-driven, see deploy/nightly-off.sh and deploy/morning-on.sh):
// stop-scheduled flags every running channel to stop gracefully at its next item boundary;
// start-scheduled brings back up whatever isn't already running (with a freshly rebuilt
// schedule, so the EPG can't drift stale across the downtime the way a plain restart would).
router.post('/stop-scheduled', async (req, res) => {
  const { rows: channels } = await db.query('SELECT * FROM channels WHERE is_active = true');
  const results = [];
  for (const channel of channels) {
    if (liquidsoap.status(channel).running) {
      await db.query('UPDATE channels SET stop_after_current = true WHERE id = $1', [channel.id]);
      results.push({ number: channel.number, action: 'will stop after current item' });
    }
  }
  res.json(results);
});

router.post('/start-scheduled', async (req, res) => {
  const { rows: channels } = await db.query('SELECT * FROM channels WHERE is_active = true');
  const results = [];
  for (const channel of channels) {
    if (!liquidsoap.status(channel).running) {
      await db.query('DELETE FROM channel_schedule WHERE channel_id = $1', [channel.id]);
      await extendChannelSchedule(channel, { regenerateFromNow: true });
      const pid = await liquidsoap.start(channel);
      results.push({ number: channel.number, pid });
    }
  }
  res.json(results);
});

router.post('/:id/start', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  // Starting (as opposed to restarting) means the channel was stopped and its queue
  // zeroed out, so build a fresh schedule from now before the Liquidsoap process comes up.
  await db.query('DELETE FROM channel_schedule WHERE channel_id = $1', [channel.id]);
  await extendChannelSchedule(channel, { regenerateFromNow: true });
  const pid = await liquidsoap.start(channel);
  res.json({ pid });
});

router.post('/:id/stop', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  await liquidsoap.stop(channel);
  await db.query('DELETE FROM channel_schedule WHERE channel_id = $1', [channel.id]);
  res.status(204).end();
});

router.post('/:id/restart', async (req, res) => {
  const channel = await getChannelOr404(req, res);
  if (!channel) return;
  const pid = await liquidsoap.restart(channel);
  res.json({ pid });
});

module.exports = router;
