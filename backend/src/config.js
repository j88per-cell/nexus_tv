require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var ${name}`);
  return value;
}

module.exports = {
  databaseUrl: required('DATABASE_URL'),
  port: parseInt(process.env.PORT || '4100', 10),
  mediaRoots: required('MEDIA_ROOTS', '/Movies').split(',').map((s) => s.trim()),
  hlsRoot: required('HLS_ROOT', '/opt/nexus/data/hls'),
  liqConfigRoot: required('LIQ_CONFIG_ROOT', '/opt/nexus/data/liq'),
  liquidsoapBin: process.env.LIQUIDSOAP_BIN || 'liquidsoap',
  ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe',
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  proxyRoot: required('PROXY_ROOT', '/Movies/_proxies'),
  // Time-bounded, not count-bounded (see backend/src/proxy/generate.js) — 270min (4.5h)
  // leaves headroom within the 1am-6am safe window for the scan/schedule steps either side.
  proxyTimeBudgetMinutes: parseInt(process.env.PROXY_TIME_BUDGET_MINUTES || '270', 10),
  proxyMaxFiles: parseInt(process.env.PROXY_MAX_FILES || '300', 10),
  // Confirmed by hand-testing: no consumer NVENC session cap hit with 4 concurrent encodes
  // on an RTX 3060. 3 leaves a little headroom for whatever else touches the GPU.
  proxyConcurrency: parseInt(process.env.PROXY_CONCURRENCY || '3', 10),
  apiBaseUrl: required('API_BASE_URL', 'http://localhost:4100'),
  publicBaseUrl: required('PUBLIC_BASE_URL', 'http://nexus.home'),
  scheduleHorizonHours: parseInt(process.env.SCHEDULE_HORIZON_HOURS || '48', 10),
  xtreamUsername: required('XTREAM_USERNAME', 'nexus'),
  xtreamPassword: required('XTREAM_PASSWORD', 'nexus'),
};
