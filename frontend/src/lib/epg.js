// Shared data shaping for the EPG grid views (rows/columns). The span matches Nexus's
// SCHEDULE_HORIZON_HOURS=48 default: 48 hours starting at the beginning of today, so it
// lines up with what channel_schedule actually contains.

export function computeSpan(base = new Date()) {
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 48 * 3600 * 1000);
  return { start, end };
}

export function fmtTimeRange(start, end, use24h) {
  const opts = use24h
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString([], opts)}–${end.toLocaleTimeString([], opts)}`;
}

export function fmtDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Shapes one channel's raw EPG entries (from GET /api/channels/epg/all) into grid-ready
// programs with percentage-based position/size within the span, so the template just needs
// `left/width` (rows layout) or `top/height` (columns layout) off the same numbers.
export function shapeChannel(channel, span, use24h) {
  const spanMs = span.end.getTime() - span.start.getTime();
  const now = Date.now();

  const programs = (channel.schedule || [])
    .map((entry) => {
      const start = new Date(entry.scheduled_start);
      const end = new Date(entry.scheduled_end);
      const startPct = ((start.getTime() - span.start.getTime()) / spanMs) * 100;
      const endPct = ((end.getTime() - span.start.getTime()) / spanMs) * 100;
      const clampedStart = Math.max(0, startPct);
      const clampedEnd = Math.min(100, endPct);
      if (clampedEnd <= clampedStart) return null;

      const isShow = Boolean(entry.show_name);
      const title = isShow ? entry.show_name : entry.title;
      const meta = isShow && entry.season && entry.episode
        ? `S${entry.season}E${entry.episode} · ${fmtTimeRange(start, end, use24h)} · ${fmtDuration(end - start)}`
        : `${fmtTimeRange(start, end, use24h)} · ${fmtDuration(end - start)}`;

      return {
        key: `${channel.id}-${entry.scheduled_start}`,
        title,
        meta,
        live: now >= start.getTime() && now < end.getTime(),
        start,
        end,
        startPct: clampedStart,
        sizePct: clampedEnd - clampedStart,
        showName: entry.show_name,
        season: entry.season,
        episode: entry.episode,
      };
    })
    .filter(Boolean);

  return { id: channel.id, number: channel.number, name: channel.name, programs };
}

export function nowPct(span) {
  const spanMs = span.end.getTime() - span.start.getTime();
  const pct = ((Date.now() - span.start.getTime()) / spanMs) * 100;
  return Math.min(100, Math.max(0, pct));
}
