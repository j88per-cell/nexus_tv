const db = require('../db');

async function getChannelEpg(channelId, hoursAhead = 24) {
  const { rows } = await db.query(
    `SELECT cs.id, cs.scheduled_start, cs.scheduled_end, mf.title, mf.show_name, mf.season, mf.episode
     FROM channel_schedule cs
     JOIN media_files mf ON mf.id = cs.media_file_id
     WHERE cs.channel_id = $1
       AND cs.scheduled_end > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       AND cs.scheduled_start < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || $2 || ' hours')
     ORDER BY cs.sort_order ASC`,
    [channelId, hoursAhead]
  );
  return rows;
}

async function getAllChannelsEpg(hoursAhead = 24) {
  const { rows: channels } = await db.query('SELECT id, number, name FROM channels WHERE is_active = true ORDER BY number');
  const result = [];
  for (const channel of channels) {
    result.push({ ...channel, schedule: await getChannelEpg(channel.id, hoursAhead) });
  }
  return result;
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// XMLTV timestamps: YYYYMMDDHHMMSS +0000 (UTC).
function xmltvTime(date) {
  const iso = new Date(date).toISOString(); // 2026-09-08T12:34:56.000Z
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)} +0000`;
}

// tvg-id values here must match the ones the M3U playlist route emits ("nexus-<number>")
// so IPTV players can match a channel's stream entry to its EPG data.
async function getAllChannelsXmltv(hoursAhead = 24) {
  const channels = await getAllChannelsEpg(hoursAhead);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="nexus">'];
  for (const channel of channels) {
    const channelId = `nexus-${channel.number}`;
    lines.push(`  <channel id="${channelId}">`);
    lines.push(`    <display-name>${xmlEscape(channel.name)}</display-name>`);
    lines.push('  </channel>');
  }
  for (const channel of channels) {
    const channelId = `nexus-${channel.number}`;
    for (const entry of channel.schedule) {
      const title = entry.show_name
        ? `${entry.show_name}${entry.season && entry.episode ? ` S${entry.season}E${entry.episode}` : ''}`
        : entry.title;
      lines.push(`  <programme start="${xmltvTime(entry.scheduled_start)}" stop="${xmltvTime(entry.scheduled_end)}" channel="${channelId}">`);
      lines.push(`    <title>${xmlEscape(title)}</title>`);
      lines.push('  </programme>');
    }
  }
  lines.push('</tv>');
  return lines.join('\n') + '\n';
}

module.exports = { getChannelEpg, getAllChannelsEpg, getAllChannelsXmltv };
