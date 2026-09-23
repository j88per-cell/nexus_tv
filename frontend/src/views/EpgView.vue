<template>
  <div class="epg" :data-theme="settings.theme" :style="{ '--accent': accent }">
    <header class="masthead">
      <div class="mark">{{ settings.station.mark }}</div>
      <div class="titles">
        <h1>{{ settings.station.name }}</h1>
        <p class="tagline">{{ settings.station.tagline }}</p>
      </div>
      <div class="clock"><span class="dot"></span>{{ clock }}</div>
      <div class="header-actions">
        <div class="seg">
          <button :class="{ active: settings.layout === 'rows' }" @click="settings.layout = 'rows'">Rows</button>
          <button :class="{ active: settings.layout === 'columns' }" @click="settings.layout = 'columns'">Columns</button>
        </div>
        <button class="icon-btn" @click="settings.theme = settings.theme === 'dark' ? 'light' : 'dark'" title="Toggle theme">
          {{ settings.theme === 'dark' ? '☾' : '☀' }}
        </button>
        <button class="icon-btn" @click="showSettings = true" title="Settings">⚙</button>
        <router-link class="icon-btn" to="/channels" title="Manage channels">☰</router-link>
      </div>
    </header>

    <div class="toolbar">
      <button class="now-btn" @click="jumpTo(new Date())">NOW</button>
      <button v-for="p in presets" :key="p.label" class="preset" @click="jumpTo(p.time())">{{ p.label }}</button>
      <div class="spacer"></div>
      <span class="label">48 HOUR WINDOW</span>
      <span class="label">{{ visibleCount }} / {{ channels.length }} STATIONS</span>
      <span class="label">30 MIN / BLOCK</span>
    </div>

    <div class="grid-scroll" ref="gridScrollEl">
      <div v-if="loading" class="loading">Loading guide…</div>

      <div v-else-if="settings.layout === 'rows'" class="grid-inner rows" :style="{ width: totalPx + PX_NAME + 'px' }">
        <div class="ruler-row sticky-top">
          <div class="corner sticky-left"></div>
          <div class="ticks" :style="{ width: totalPx + 'px' }">
            <div v-for="t in ticks" :key="t.pct" class="tick" :class="{ hour: t.isHour }" :style="{ left: t.pct + '%' }">
              <span v-if="t.isHour">{{ t.label }}</span>
            </div>
          </div>
        </div>
        <div v-for="ch in channels" :key="ch.id" class="channel-row">
          <div class="name-cell sticky-left">
            <span class="ch-num">{{ ch.number }}</span>
            <span class="ch-name">{{ ch.name }}</span>
          </div>
          <div class="track" :style="{ width: totalPx + 'px' }">
            <button
              v-for="p in ch.programs"
              :key="p.key"
              class="block"
              :class="{ live: p.live, selected: selected && selected.key === p.key }"
              :style="{ left: p.startPct + '%', width: p.sizePct + '%' }"
              @click="select(ch, p)"
            >
              <span v-if="p.live" class="live-badge">LIVE</span>
              <span class="block-title">{{ p.title }}</span>
            </button>
            <div class="now-line" :style="{ left: nowLinePct + '%' }"></div>
          </div>
        </div>
      </div>

      <div v-else class="grid-inner columns">
        <div class="col-header sticky-top">
          <div class="corner sticky-left"></div>
          <div v-for="ch in channels" :key="ch.id" class="col-name">
            <span class="ch-num">{{ ch.number }}</span>
            <span class="ch-name">{{ ch.name }}</span>
          </div>
        </div>
        <div class="col-body-row">
          <div class="time-col sticky-left" :style="{ height: totalPx + 'px' }">
            <div v-for="t in ticks" :key="t.pct" class="tick" :class="{ hour: t.isHour }" :style="{ top: t.pct + '%' }">
              <span v-if="t.isHour">{{ t.label }}</span>
            </div>
          </div>
          <div class="cols-body" :style="{ height: totalPx + 'px' }">
            <div v-for="ch in channels" :key="ch.id" class="col-track">
              <button
                v-for="p in ch.programs"
                :key="p.key"
                class="block"
                :class="{ live: p.live, selected: selected && selected.key === p.key }"
                :style="{ top: p.startPct + '%', height: p.sizePct + '%' }"
                @click="select(ch, p)"
              >
                <span v-if="p.live" class="live-badge">LIVE</span>
                <span class="block-title">{{ p.title }}</span>
              </button>
            </div>
            <div class="now-line-h" :style="{ top: nowLinePct + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <transition name="slide-up">
      <div class="detail" v-if="selected">
        <div class="detail-art"></div>
        <div class="detail-body">
          <p class="detail-slot">{{ selectedChannel.number }} · {{ selectedChannel.name }}</p>
          <h3>{{ selected.title }}</h3>
          <p class="detail-meta">{{ selected.meta }}</p>
          <p class="detail-synopsis">No synopsis available yet.</p>
          <div class="detail-actions">
            <button class="watch" @click="play(selectedChannel)">Play</button>
            <button class="watch ghost" @click="selected = null">Close</button>
          </div>
        </div>
      </div>
    </transition>

    <SettingsDrawer v-if="showSettings" @close="showSettings = false" />

    <div class="overlay" v-if="playingChannel" @keydown.esc="playingChannel = null" tabindex="-1" ref="overlayEl">
      <div class="video-wrap">
        <VideoPlayer :src="streamUrl(playingChannel)" />
      </div>
      <button class="overlay-close" @click="playingChannel = null">✕ Close</button>
      <div class="overlay-info">
        <span class="ov-num">{{ playingChannel.number }}</span>
        <span class="ov-name">{{ playingChannel.name }}</span>
        <span class="ov-title" v-if="playingChannel.nowTitle">— {{ playingChannel.nowTitle }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { api } from '../api';
import { epgSettings as settings, accentColor } from '../lib/epgSettings';
import { computeSpan, shapeChannel, nowPct, fmtTimeRange } from '../lib/epg';
import SettingsDrawer from '../components/SettingsDrawer.vue';
import VideoPlayer from '../components/VideoPlayer.vue';

const PX_PER_SLOT = 60; // px per 30-min tick
const SLOTS = 96; // 48h / 30min
const PX_NAME = 220; // sticky name/time column width
const totalPx = PX_PER_SLOT * SLOTS;

const loading = ref(true);
const channels = ref([]);
const span = ref(computeSpan());
const clock = ref('');
const showSettings = ref(false);
const selected = ref(null);
const selectedChannelId = ref(null);
const playingChannel = ref(null);
const gridScrollEl = ref(null);

const accent = computed(() => accentColor());
const visibleCount = computed(() => channels.value.length);
const selectedChannel = computed(() => channels.value.find((c) => c.id === selectedChannelId.value) || {});

const ticks = computed(() => {
  const result = [];
  for (let i = 0; i < SLOTS; i += 1) {
    const t = new Date(span.value.start.getTime() + i * 30 * 60 * 1000);
    const isHour = t.getMinutes() === 0;
    result.push({
      pct: (i / SLOTS) * 100,
      isHour,
      label: isHour
        ? t.toLocaleTimeString([], settings.clock24h ? { hour: '2-digit', hour12: false } : { hour: 'numeric' })
        : '',
    });
  }
  return result;
});

const nowLinePct = computed(() => nowPct(span.value));

const presets = [
  { label: '06:00', time: () => atHour(6) },
  { label: '12:00', time: () => atHour(12) },
  { label: 'PRIME 20:00', time: () => atHour(20) },
  { label: 'TOMORROW', time: () => new Date(span.value.start.getTime() + 24 * 3600 * 1000) },
];

function atHour(h) {
  const d = new Date(span.value.start);
  d.setHours(h, 0, 0, 0);
  return d;
}

function jumpTo(date) {
  const el = gridScrollEl.value;
  if (!el) return;
  const spanMs = span.value.end.getTime() - span.value.start.getTime();
  const pct = Math.min(1, Math.max(0, (date.getTime() - span.value.start.getTime()) / spanMs));
  if (settings.layout === 'rows') {
    el.scrollTo({ left: pct * totalPx - 80, behavior: 'smooth' });
  } else {
    el.scrollTo({ top: pct * totalPx - 80, behavior: 'smooth' });
  }
}

function select(channel, program) {
  if (selected.value && selected.value.key === program.key) {
    selected.value = null;
    return;
  }
  selected.value = program;
  selectedChannelId.value = channel.id;
}

function streamUrl(channel) {
  return `/streams/${channel.number}/stream.m3u8`;
}

function play(channel) {
  playingChannel.value = { ...channel, nowTitle: selected.value?.title };
  selected.value = null;
  nextTick(() => document.querySelector('.overlay')?.focus());
}

function fmtClock() {
  const now = new Date();
  return now.toLocaleTimeString([], settings.clock24h ? { hour12: false } : {});
}

async function load() {
  loading.value = true;
  const [list, epgAll] = await Promise.all([api.listChannels(), api.getAllEpg(48)]);
  const epgById = new Map(epgAll.map((c) => [c.id, c]));
  channels.value = list
    .filter((c) => c.is_active !== false)
    .map((c) => reactive(shapeChannel(epgById.get(c.id) || c, span.value, settings.clock24h)));
  loading.value = false;
}

let clockTimer = null;
let refreshTimer = null;

onMounted(async () => {
  clock.value = fmtClock();
  clockTimer = setInterval(() => { clock.value = fmtClock(); }, 1000);
  await load();
  refreshTimer = setInterval(load, 5 * 60 * 1000);
  await nextTick();
  jumpTo(new Date());
});

onUnmounted(() => {
  clearInterval(clockTimer);
  clearInterval(refreshTimer);
});
</script>

<style scoped>
.epg {
  --bg: #131211;
  --surface: #1c1a17;
  --border: #322f2a;
  --muted: #9a938a;
  --fg: #f1efe9;
  font-family: 'Archivo', system-ui, sans-serif;
  color: var(--fg);
  min-height: 100vh;
}
.epg[data-theme='light'] {
  --bg: #f4f2ed;
  --surface: #fffefb;
  --border: #ddd8ce;
  --muted: #736c62;
  --fg: #201d19;
}

.masthead {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 30;
}
.mark {
  width: 36px; height: 36px; border-radius: 4px; background: var(--accent);
  color: #0c1410; display: flex; align-items: center; justify-content: center;
  font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 0.75rem; flex-shrink: 0;
}
.titles h1 { margin: 0; font-size: 1rem; font-weight: 800; }
.tagline { margin: 0; font-family: 'IBM Plex Mono', monospace; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.clock { font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--muted); display: flex; align-items: center; gap: 0.4rem; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: blink 2s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
.header-actions { margin-left: auto; display: flex; align-items: center; gap: 0.5rem; }
.seg { display: flex; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.seg button {
  background: var(--surface); border: none; color: var(--muted); font-family: 'IBM Plex Mono', monospace;
  font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.4rem 0.6rem; cursor: pointer;
}
.seg button.active { background: var(--accent); color: #0c1410; }
.icon-btn {
  background: var(--surface); border: 1px solid var(--border); color: var(--muted);
  width: 30px; height: 30px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  text-decoration: none; font-size: 0.9rem;
}
.icon-btn:hover { color: var(--fg); border-color: var(--accent); }

.toolbar {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border); font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem;
}
.now-btn { background: var(--accent); color: #0c1410; border: none; padding: 0.35rem 0.7rem; border-radius: 4px; font-weight: 700; cursor: pointer; letter-spacing: 0.05em; }
.preset { background: var(--surface); border: 1px solid var(--border); color: var(--muted); padding: 0.35rem 0.6rem; border-radius: 4px; cursor: pointer; }
.preset:hover { color: var(--fg); border-color: var(--accent); }
.spacer { flex: 1; }
.label { color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }

.grid-scroll { overflow: auto; height: calc(100vh - 120px); position: relative; }
.loading { padding: 3rem; text-align: center; color: var(--muted); font-family: 'IBM Plex Mono', monospace; }

.grid-inner.rows { position: relative; }
.sticky-top { position: sticky; top: 0; z-index: 10; display: flex; }
.sticky-left { position: sticky; left: 0; z-index: 5; background: var(--bg); }
.corner { width: 220px; flex-shrink: 0; background: var(--bg); border-bottom: 1px solid var(--border); z-index: 11; }
.ruler-row { background: var(--bg); }
.ticks { position: relative; height: 32px; border-bottom: 1px solid var(--border); }
.tick { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--border); padding-left: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.65rem; color: var(--muted); display: flex; align-items: center; }
.tick.hour { border-left-color: var(--muted); }

.channel-row { display: flex; height: 80px; border-bottom: 1px solid var(--border); }
.name-cell {
  width: 220px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center;
  padding: 0 0.75rem; border-right: 1px solid var(--border);
}
.ch-num { font-family: 'IBM Plex Mono', monospace; color: var(--muted); font-size: 0.7rem; }
.ch-name { font-weight: 600; font-size: 0.9rem; }
.track { position: relative; }
.track::before {
  content: ''; position: absolute; inset: 0;
  background-image: repeating-linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent calc(100% / 48));
  opacity: 0.4; pointer-events: none;
}

.block {
  position: absolute; top: 6px; bottom: 6px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 3px; padding: 0.35rem 0.5rem; text-align: left; cursor: pointer; overflow: hidden;
  color: inherit; font-family: inherit; display: flex; flex-direction: column; gap: 0.15rem;
}
.block:hover { border-color: var(--accent); }
.block.live { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.block.selected { box-shadow: 0 0 0 2px var(--accent); }
.live-badge { font-family: 'IBM Plex Mono', monospace; font-size: 0.6rem; color: var(--accent); letter-spacing: 0.05em; }
.block-title { font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.now-line { position: absolute; top: 0; bottom: -2000px; width: 2px; background: var(--accent); z-index: 6; }
.now-line::before { content: 'NOW'; position: absolute; top: -18px; left: -14px; font-family: 'IBM Plex Mono', monospace; font-size: 0.6rem; color: var(--accent); }

/* Columns layout — same sticky-top/sticky-left pattern as rows, just transposed. Both axes
   of stickiness reference the shared .grid-scroll scrollport, so a corner cell with both
   classes freezes on both axes independently. */
.grid-inner.columns { display: block; }
.col-header { display: flex; }
.col-header .corner { width: 90px; flex-shrink: 0; }
.col-name { width: 180px; flex-shrink: 0; padding: 0.5rem 0.6rem; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--bg); display: flex; flex-direction: column; justify-content: center; }
.col-body-row { display: flex; }
.time-col { width: 90px; flex-shrink: 0; position: relative; background: var(--bg); }
.time-col .tick { position: absolute; left: 0; right: 0; top: auto; border-left: none; border-top: 1px solid var(--border); align-items: flex-start; padding: 2px 0 0 6px; height: auto; }
.cols-body { position: relative; flex: 1; display: flex; }
.col-track { width: 180px; flex-shrink: 0; position: relative; border-right: 1px solid var(--border); }
.now-line-h { position: absolute; left: 0; right: 0; height: 2px; background: var(--accent); z-index: 6; }

.detail {
  position: sticky; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1px solid var(--border);
  display: flex; gap: 1rem; padding: 1rem; z-index: 20;
}
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.2s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }
.detail-art { width: 80px; height: 80px; background: var(--bg); border-radius: 4px; flex-shrink: 0; }
.detail-body { flex: 1; min-width: 0; }
.detail-slot { margin: 0 0 0.2rem; font-family: 'IBM Plex Mono', monospace; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; }
.detail-body h3 { margin: 0 0 0.2rem; font-size: 1.1rem; }
.detail-meta { margin: 0 0 0.4rem; color: var(--muted); font-size: 0.8rem; }
.detail-synopsis { margin: 0 0 0.6rem; color: var(--muted); font-size: 0.85rem; }
.detail-actions { display: flex; gap: 0.5rem; }
.watch { font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #0c1410; background: var(--accent); border: none; padding: 0.5rem 0.9rem; border-radius: 4px; cursor: pointer; }
.watch.ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }

.overlay { position: fixed; inset: 0; background: #000; z-index: 50; display: flex; flex-direction: column; }
.video-wrap { flex: 1; }
.overlay-close { position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: #fff; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; }
.overlay-info { padding: 0.75rem 1rem; background: #000; color: #fff; font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; display: flex; gap: 0.6rem; }
.ov-num { color: var(--accent); }
</style>
