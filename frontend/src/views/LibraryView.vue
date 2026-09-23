<template>
  <div>
    <h1>Library</h1>
    <input v-model="query" placeholder="Search title..." @input="search" />
    <table>
      <thead>
        <tr><th>Title</th><th>Show</th><th>S</th><th>E</th><th>Duration</th><th>Path</th></tr>
      </thead>
      <tbody>
        <tr v-for="file in files" :key="file.id">
          <td>{{ file.title }}</td>
          <td>{{ file.show_name }}</td>
          <td>{{ file.season }}</td>
          <td>{{ file.episode }}</td>
          <td>{{ formatDuration(file.duration_seconds) }}</td>
          <td class="path">{{ file.absolute_path }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const files = ref([]);
const query = ref('');

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

async function search() {
  files.value = await api.listMedia(query.value ? { q: query.value } : {});
}

onMounted(search);
</script>

<style scoped>
.path { font-family: monospace; font-size: 0.8em; color: #888; }
</style>
