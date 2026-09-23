<template>
  <div class="backdrop" @click="close"></div>
  <aside class="drawer" @keydown.esc="close" tabindex="-1" ref="drawerEl">
    <header>
      <h2>Settings</h2>
      <button class="icon-btn" @click="close" aria-label="Close settings">✕</button>
    </header>

    <nav class="tabs">
      <button v-for="t in tabs" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
    </nav>

    <div class="panel" v-if="tab === 'Identity'">
      <label>Station name<input v-model="settings.station.name" /></label>
      <label>Tagline<input v-model="settings.station.tagline" /></label>
      <label>Mark (2-3 letters)<input v-model="settings.station.mark" maxlength="3" /></label>
    </div>

    <div class="panel" v-else-if="tab === 'Channels'">
      <p class="hint">Toggle a channel on/off air. (Reordering isn't supported yet — channels
        list in number order.)</p>
      <div v-for="c in channels" :key="c.id" class="channel-row">
        <span class="ch-num">{{ c.number }}</span>
        <span class="ch-name">{{ c.name }}</span>
        <label class="switch">
          <input type="checkbox" :checked="c.is_active" @change="toggleChannel(c, $event.target.checked)" />
          <span>{{ c.is_active ? 'ON AIR' : 'HIDDEN' }}</span>
        </label>
      </div>
    </div>

    <div class="panel" v-else-if="tab === 'Appearance'">
      <label>Theme
        <select v-model="settings.theme">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label>Accent color
        <div class="swatches">
          <button
            v-for="c in accents"
            :key="c"
            class="swatch"
            :class="{ active: settings.accent === c }"
            :style="{ background: swatchColor(c) }"
            @click="settings.accent = c"
            :aria-label="c"
          ></button>
        </div>
      </label>
      <label>Clock format
        <select v-model="settings.clock24h">
          <option :value="true">24-hour</option>
          <option :value="false">12-hour</option>
        </select>
      </label>
      <label>Default grid layout
        <select v-model="settings.layout">
          <option value="rows">Rows</option>
          <option value="columns">Columns</option>
        </select>
      </label>
    </div>

    <div class="panel" v-else-if="tab === 'Watermark'">
      <label>Text<input v-model="settings.watermark.text" placeholder="(none)" /></label>
      <label>Corner
        <div class="corner-grid">
          <button
            v-for="c in ['tl', 'tr', 'bl', 'br']"
            :key="c"
            :class="{ active: settings.watermark.corner === c }"
            @click="settings.watermark.corner = c"
          >{{ c.toUpperCase() }}</button>
        </div>
      </label>
      <label>Opacity
        <input type="range" min="0.1" max="1" step="0.05" v-model.number="settings.watermark.opacity" />
      </label>
      <div class="watermark-preview">
        <span :class="`corner-${settings.watermark.corner}`" :style="{ opacity: settings.watermark.opacity }">
          {{ settings.watermark.text || 'Watermark preview' }}
        </span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { epgSettings as settings } from '../lib/epgSettings';
import { api } from '../api';

const emit = defineEmits(['close']);
const tabs = ['Identity', 'Channels', 'Appearance', 'Watermark'];
const tab = ref('Identity');
const accents = ['green', 'blue', 'rust', 'purple', 'ochre'];
const channels = ref([]);
const drawerEl = ref(null);

const SWATCH_HEX = {
  green: '#4c9e77',
  blue: '#5b8fd6',
  rust: '#c97650',
  purple: '#a179d6',
  ochre: '#c2a63f',
};
function swatchColor(c) {
  return SWATCH_HEX[c];
}

function close() {
  emit('close');
}

async function toggleChannel(channel, isActive) {
  await api.updateChannel(channel.id, { is_active: isActive });
  channel.is_active = isActive;
}

onMounted(async () => {
  channels.value = await api.listChannels();
  drawerEl.value?.focus();
});
</script>

<style scoped>
.backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 40;
}
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 92vw);
  background: var(--surface); border-left: 1px solid var(--border);
  z-index: 41; display: flex; flex-direction: column; padding: 1.25rem;
  overflow-y: auto;
}
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
header h2 { margin: 0; font-size: 1.1rem; }
.icon-btn { background: none; border: none; color: var(--muted); font-size: 1rem; cursor: pointer; }
.icon-btn:hover { color: #fff; }

.tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid var(--border); margin-bottom: 1rem; padding-bottom: 0.6rem; }
.tabs button {
  background: none; border: 1px solid var(--border); color: var(--muted);
  font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; text-transform: uppercase;
  letter-spacing: 0.05em; padding: 0.4rem 0.7rem; border-radius: 4px; cursor: pointer;
}
.tabs button.active { color: #0c1410; background: var(--accent); border-color: var(--accent); }

.panel { display: flex; flex-direction: column; gap: 1rem; }
.panel label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; color: var(--muted); }
.panel input, .panel select {
  background: var(--bg); border: 1px solid var(--border); color: inherit;
  padding: 0.45rem 0.6rem; border-radius: 4px; font-family: inherit;
}

.hint { font-size: 0.8rem; color: var(--muted); margin: 0; }
.channel-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
.ch-num { font-family: 'IBM Plex Mono', monospace; color: var(--muted); width: 1.5rem; }
.ch-name { flex: 1; }
.switch { display: flex; align-items: center; gap: 0.4rem; font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; color: var(--muted); cursor: pointer; }

.swatches { display: flex; gap: 0.5rem; }
.swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.swatch.active { border-color: #fff; }

.corner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; width: 120px; }
.corner-grid button {
  background: var(--bg); border: 1px solid var(--border); color: var(--muted);
  font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; padding: 0.5rem; border-radius: 4px; cursor: pointer;
}
.corner-grid button.active { color: #0c1410; background: var(--accent); border-color: var(--accent); }

.watermark-preview {
  position: relative; height: 100px; border: 1px dashed var(--border); border-radius: 4px;
  font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; color: var(--muted);
}
.watermark-preview span { position: absolute; padding: 0.5rem; }
.corner-tl { top: 0; left: 0; }
.corner-tr { top: 0; right: 0; }
.corner-bl { bottom: 0; left: 0; }
.corner-br { bottom: 0; right: 0; }
</style>
