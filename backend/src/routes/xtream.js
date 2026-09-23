const express = require('express');
const db = require('../db');
const config = require('../config');
const { getChannelEpg, getAllChannelsXmltv } = require('../scheduler/epg');

const router = express.Router();

const CATEGORY_ID = '1';
const CATEGORY_NAME = 'Nexus';

function checkAuth(req) {
  const { username, password } = { ...req.query, ...req.body };
  return username === config.xtreamUsername && password === config.xtreamPassword;
}

function unauthorized(res) {
  res.status(401).json({ user_info: { auth: 0, status: 'Disabled' } });
}

function userInfo() {
  return {
    username: config.xtreamUsername,
    password: config.xtreamPassword,
    message: '',
    auth: 1,
    status: 'Active',
    exp_date: null,
    is_trial: '0',
    active_cons: '0',
    created_at: Math.floor(Date.now() / 1000),
    max_connections: '1',
    allowed_output_formats: ['m3u8', 'ts'],
  };
}

function serverInfo() {
  const url = new URL(config.publicBaseUrl);
  return {
    url: url.hostname,
    port: url.port || (url.protocol === 'https:' ? '443' : '80'),
    https_port: '443',
    server_protocol: url.protocol.replace(':', ''),
    rtmp_port: '25462',
    timezone: 'UTC',
    timestamp_now: Math.floor(Date.now() / 1000),
    time_now: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
}

// Xtream Codes-compatible EPG listing shape (title/description base64-encoded,
// as apps like IPTV Smarters Pro expect).
function toEpgListing(channel, entry, now) {
  const title = entry.show_name
    ? `${entry.show_name}${entry.season && entry.episode ? ` S${entry.season}E${entry.episode}` : ''}`
    : entry.title;
  const start = new Date(entry.scheduled_start);
  const stop = new Date(entry.scheduled_end);
  return {
    id: String(entry.id || 0),
    epg_id: `nexus-${channel.number}`,
    title: Buffer.from(title || '').toString('base64'),
    lang: '',
    start: start.toISOString().replace('T', ' ').slice(0, 19),
    end: stop.toISOString().replace('T', ' ').slice(0, 19),
    description: Buffer.from('').toString('base64'),
    channel_id: `nexus-${channel.number}`,
    start_timestamp: String(Math.floor(start.getTime() / 1000)),
    stop_timestamp: String(Math.floor(stop.getTime() / 1000)),
    now_playing: now >= start && now < stop ? 1 : 0,
    has_archive: 0,
  };
}

async function getChannelByNumber(streamId) {
  const { rows } = await db.query('SELECT * FROM channels WHERE number = $1 AND is_active = true', [streamId]);
  return rows[0] || null;
}

router.all('/player_api.php', async (req, res) => {
  if (!checkAuth(req)) return unauthorized(res);
  const action = req.query.action || req.body.action;

  if (!action) {
    return res.json({ user_info: userInfo(), server_info: serverInfo() });
  }

  if (action === 'get_live_categories') {
    return res.json([{ category_id: CATEGORY_ID, category_name: CATEGORY_NAME, parent_id: 0 }]);
  }

  if (action === 'get_live_streams') {
    const { rows: channels } = await db.query('SELECT * FROM channels WHERE is_active = true ORDER BY number');
    return res.json(channels.map((channel) => ({
      num: channel.number,
      name: channel.name,
      stream_type: 'live',
      stream_id: channel.number,
      stream_icon: '',
      epg_channel_id: `nexus-${channel.number}`,
      added: String(Math.floor(new Date(channel.created_at).getTime() / 1000)),
      category_id: CATEGORY_ID,
      custom_sid: '',
      tv_archive: 0,
      direct_source: '',
      tv_archive_duration: 0,
    })));
  }

  if (action === 'get_short_epg' || action === 'get_simple_data_table') {
    const streamId = Number(req.query.stream_id || req.body.stream_id);
    const channel = await getChannelByNumber(streamId);
    if (!channel) return res.json({ epg_listings: [] });
    const limit = action === 'get_short_epg' ? Number(req.query.limit || req.body.limit || 4) : Infinity;
    const entries = await getChannelEpg(channel.id, 24);
    const now = new Date();
    return res.json({ epg_listings: entries.slice(0, limit).map((entry) => toEpgListing(channel, entry, now)) });
  }

  return res.json([]);
});

router.get('/xmltv.php', async (req, res) => {
  if (!checkAuth(req)) return unauthorized(res);
  const xml = await getAllChannelsXmltv(24);
  res.type('application/xml').send(xml);
});

// Xtream Codes stream URL convention: /live/<username>/<password>/<streamID>.<ext>
router.get('/live/:username/:password/:streamFile', async (req, res) => {
  const { username, password, streamFile } = req.params;
  if (username !== config.xtreamUsername || password !== config.xtreamPassword) {
    return res.status(401).end();
  }
  const streamId = Number(streamFile.split('.')[0]);
  const channel = await getChannelByNumber(streamId);
  if (!channel) return res.status(404).end();
  res.redirect(302, `${config.publicBaseUrl}/streams/${channel.number}/stream.m3u8`);
});

module.exports = router;
