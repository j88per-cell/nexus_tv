const express = require('express');
const config = require('./config');
const mediaRoutes = require('./routes/media');
const channelRoutes = require('./routes/channels');
const xtreamRoutes = require('./routes/xtream');
const { extendAllActiveChannels } = require('./scheduler/generate');

const app = express();
app.use(express.json());

// Some IPTV apps (e.g. m3Ultra TV) uppercase URLs they store as "sources" with no way to
// stop it (so "/api/channels/epg.xml" becomes "/API/channels/EPG.XML"). Routes below are
// all lowercase, so normalize the path — but not the query string — before matching.
// Skipped for /live/... since that path carries the case-sensitive Xtream username/password.
app.use((req, res, next) => {
  const queryIndex = req.url.indexOf('?');
  const pathPart = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
  const queryPart = queryIndex === -1 ? '' : req.url.slice(queryIndex);
  if (!pathPart.toLowerCase().startsWith('/live/')) {
    req.url = pathPart.toLowerCase() + queryPart;
  }
  next();
});

app.use('/api/media', mediaRoutes);
app.use('/api/channels', channelRoutes);
app.use('/', xtreamRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const SCHEDULE_TICK_MS = 15 * 60 * 1000;
function scheduleTick() {
  extendAllActiveChannels().catch((err) => console.error('Schedule generation failed:', err));
}

app.listen(config.port, () => {
  console.log(`Nexus API listening on :${config.port}`);
  scheduleTick();
  setInterval(scheduleTick, SCHEDULE_TICK_MS);
});
