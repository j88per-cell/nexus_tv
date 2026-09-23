import { reactive, watch } from 'vue';

const STORAGE_KEY = 'epg.settings.v1';

const ACCENTS = {
  green: { light: '#2f7d5a', dark: '#4c9e77' },
  blue: { light: '#2f5f9e', dark: '#5b8fd6' },
  rust: { light: '#9e4a2f', dark: '#c97650' },
  purple: { light: '#6b3f9e', dark: '#a179d6' },
  ochre: { light: '#8a7222', dark: '#c2a63f' },
};

const defaults = {
  theme: 'dark', // 'light' | 'dark'
  accent: 'green',
  clock24h: true,
  layout: 'rows', // 'rows' | 'columns'
  station: { name: 'Nexus.tv', tagline: 'your channels, your library, on your schedule', mark: 'NX' },
  watermark: { text: '', corner: 'br', opacity: 0.5 },
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaults);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(defaults), ...parsed };
  } catch {
    return structuredClone(defaults);
  }
}

export const epgSettings = reactive(load());

watch(
  epgSettings,
  (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    } catch {
      // storage unavailable (private window, quota, etc.) — settings just won't persist
    }
  },
  { deep: true }
);

export function accentColor() {
  const set = ACCENTS[epgSettings.accent] || ACCENTS.green;
  return epgSettings.theme === 'light' ? set.light : set.dark;
}
