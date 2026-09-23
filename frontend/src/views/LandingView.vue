<template>
  <div class="landing">
    <header class="masthead">
      <div class="mark">NX</div>
      <div class="titles">
        <h1>Nexus.tv</h1>
        <p class="tagline">your channels, your library, on your schedule</p>
      </div>
      <div class="clock">
        <span class="dot" :class="{ live: true }"></span>
        {{ clock }}
      </div>
    </header>

    <section class="hero" v-if="channels.length" @mouseenter="pause = true" @mouseleave="pause = false">
      <button class="nav prev" @click="step(-1)" aria-label="Previous channel">‹</button>

      <div class="hero-card">
        <div class="hero-chno">{{ current.number }}</div>
        <div class="hero-body">
          <div class="hero-status" :class="{ off: !current.running }">
            {{ current.running ? 'ON AIR' : 'OFF AIR' }}
          </div>
          <h2 class="hero-title">{{ current.title || (current.running ? 'Loading…' : 'Channel is off') }}</h2>
          <p class="hero-channel">{{ current.name }}</p>

          <div class="hero-progress" v-if="current.running && current.progress !== null">
            <div class="bar"><div class="fill" :style="{ width: current.progress + '%' }"></div></div>
            <span class="times">{{ current.elapsedLabel }} elapsed · {{ current.remainingLabel }} left</span>
          </div>

          <div class="hero-actions">
            <a class="watch" :href="streamUrl(current)" target="_blank" v-if="current.running">Watch ↗</a>
            <router-link class="watch ghost" to="/guide">Full guide</router-link>
          </div>
        </div>
      </div>

      <button class="nav next" @click="step(1)" aria-label="Next channel">›</button>
    </section>

    <div class="dots" v-if="channels.length > 1">
      <button
        v-for="(c, i) in channels"
        :key="c.id"
        class="dot-btn"
        :class="{ active: i === index, off: !c.running }"
        @click="goTo(i)"
        :aria-label="`Channel ${c.number}`"
      ></button>
    </div>

    <section class="grid">
      <h3 class="grid-title">All channels</h3>
      <div class="cards">
        <button
          v-for="(c, i) in channels"
          :key="c.id"
          class="card"
          :class="{ active: i === index, off: !c.running }"
          @click="goTo(i)"
        >
          <div class="card-top">
            <span class="card-num">{{ c.number }}</span>
            <span class="card-dot" :class="{ off: !c.running }"></span>
          </div>
          <div class="card-name">{{ c.name }}</div>
          <div class="card-now">{{ c.title || (c.running ? '…' : 'Off air') }}</div>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { api } from '../api';

const channels = ref([]);
const index = ref(0);
const pause = ref(false);
const clock = ref('');

let rotateTimer = null;
let clockTimer = null;

function fmtClock(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function streamUrl(c) {
  return `/streams/${c.number}/stream.m3u8`;
}

function buildNowInfo(schedule) {
  const now = Date.now();
  const entry = schedule.find((e) => {
    const start = new Date(e.scheduled_start).getTime();
    const end = new Date(e.scheduled_end).getTime();
    return now >= start && now < end;
  }) || schedule[0];

  if (!entry) return { title: null, progress: null, elapsedLabel: '', remainingLabel: '' };

  const start = new Date(entry.scheduled_start).getTime();
  const end = new Date(entry.scheduled_end).getTime();
  const span = end - start;
  const elapsed = now - start;
  // Known EPG-drift limitation: schedule timestamps are estimates, not live-tracked —
  // clamp so a stale/negative span never renders a nonsense bar instead of just hiding it.
  const progress = span > 0 ? Math.min(100, Math.max(0, (elapsed / span) * 100)) : null;

  const title = entry.show_name
    ? `${entry.show_name}${entry.season && entry.episode ? ` · S${entry.season}E${entry.episode}` : ''}`
    : entry.title;

  return {
    title,
    progress,
    elapsedLabel: fmtDuration(Math.max(0, elapsed)),
    remainingLabel: fmtDuration(Math.max(0, end - now)),
  };
}

async function load() {
  const [list, epgAll] = await Promise.all([api.listChannels(), api.getAllEpg(3)]);
  const epgByChannel = new Map(epgAll.map((c) => [c.id, c.schedule]));

  const withStatus = await Promise.all(
    list.map(async (c) => {
      const full = await api.getChannel(c.id);
      const info = buildNowInfo(epgByChannel.get(c.id) || []);
      return reactive({ ...c, running: full.running, ...info });
    })
  );

  channels.value = withStatus.filter((c) => c.is_active !== false);
}

async function refreshNowInfo() {
  if (!channels.value.length) return;
  const epgAll = await api.getAllEpg(3);
  const epgByChannel = new Map(epgAll.map((c) => [c.id, c.schedule]));
  for (const c of channels.value) {
    Object.assign(c, buildNowInfo(epgByChannel.get(c.id) || []));
  }
}

const current = computed(() => channels.value[index.value] || {});

function step(delta) {
  if (!channels.value.length) return;
  index.value = (index.value + delta + channels.value.length) % channels.value.length;
}

function goTo(i) {
  index.value = i;
  pause.value = true;
  setTimeout(() => { pause.value = false; }, 8000);
}

onMounted(async () => {
  await load();
  clock.value = fmtClock(new Date());
  clockTimer = setInterval(() => { clock.value = fmtClock(new Date()); }, 1000);
  rotateTimer = setInterval(() => {
    if (!pause.value) step(1);
  }, 7000);
  setInterval(refreshNowInfo, 60000);
});

onUnmounted(() => {
  clearInterval(rotateTimer);
  clearInterval(clockTimer);
});
</script>

<style scoped>
.landing {
  --accent: #4c9e77;
  --bg: #131211;
  --surface: #1c1a17;
  --border: #322f2a;
  --muted: #9a938a;
  font-family: 'Archivo', system-ui, sans-serif;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem 0 3rem;
}

.masthead {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}
.mark {
  width: 44px;
  height: 44px;
  border-radius: 4px;
  background: var(--accent);
  color: #0c1410;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.titles h1 { margin: 0; font-size: 1.3rem; font-weight: 800; letter-spacing: -0.01em; }
.tagline {
  margin: 0.15rem 0 0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.clock {
  margin-left: auto;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.85rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.dot.live { animation: blink 2s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

.hero {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}
.nav {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 1.5rem;
  width: 44px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.nav:hover { color: #fff; border-color: var(--accent); }

.hero-card {
  flex: 1;
  display: flex;
  gap: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1.75rem;
  min-height: 220px;
}
.hero-chno {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 3.5rem;
  font-weight: 600;
  color: var(--accent);
  line-height: 1;
  flex-shrink: 0;
}
.hero-body { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
.hero-status {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: var(--accent);
}
.hero-status.off { color: var(--muted); }
.hero-title { margin: 0; font-size: 1.6rem; font-weight: 700; overflow-wrap: anywhere; }
.hero-channel { margin: 0; color: var(--muted); font-size: 0.9rem; }

.hero-progress { margin-top: 0.5rem; }
.bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); }
.times {
  display: block;
  margin-top: 0.35rem;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  color: var(--muted);
}

.hero-actions { margin-top: auto; display: flex; gap: 0.6rem; padding-top: 0.75rem; }
.watch {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-decoration: none;
  color: #0c1410;
  background: var(--accent);
  padding: 0.5rem 0.9rem;
  border-radius: 4px;
}
.watch.ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
.watch:hover { filter: brightness(1.1); }

.dots { display: flex; justify-content: center; gap: 0.4rem; margin: 1rem 0 2rem; }
.dot-btn {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--border); border: none; cursor: pointer; padding: 0;
}
.dot-btn.active { background: var(--accent); width: 18px; border-radius: 4px; }
.dot-btn.off { background: #3a2f2f; }

.grid-title {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin: 0 0 0.75rem;
}
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.6rem; }
.card {
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0.7rem 0.8rem;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
}
.card:hover { border-color: var(--accent); }
.card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
.card-num { font-family: 'IBM Plex Mono', monospace; color: var(--muted); font-size: 0.8rem; }
.card-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.card-dot.off { background: #4a4038; }
.card-name { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.2rem; }
.card-now {
  font-size: 0.75rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card.off .card-now { font-style: italic; }
</style>
