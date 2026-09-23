<template>
  <div>
    <h1>Channels</h1>

    <section>
      <h2>New channel</h2>
      <form @submit.prevent="createChannel">
        <input v-model.number="newChannel.number" placeholder="Number" type="number" required />
        <input v-model="newChannel.name" placeholder="Name" required />
        <button type="submit">Create</button>
      </form>
    </section>

    <section v-for="channel in channels" :key="channel.id" class="channel-card">
      <h2>{{ channel.number }} — {{ channel.name }}</h2>
      <p>
        <button @click="startChannel(channel)">Start</button>
        <button @click="stopChannel(channel)">Stop</button>
        <button @click="restartChannel(channel)">Restart</button>
        <a :href="`/streams/${channel.number}/stream.m3u8`" target="_blank">stream url</a>
      </p>

      <details>
        <summary>Rule</summary>
        <form @submit.prevent="saveRule(channel)">
          <select v-model="ruleForms[channel.id].rule_type">
            <option value="folder">Folder (movies)</option>
            <option value="show">Show (TV, chronological)</option>
          </select>
          <input v-model="ruleForms[channel.id].rule_value" placeholder="Folder path or show name" required />
          <label>
            <input type="checkbox" v-model="ruleForms[channel.id].shuffle" />
            Shuffle
          </label>
          <button type="submit">Save rule</button>
        </form>
      </details>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api';

const channels = ref([]);
const ruleForms = reactive({});
const newChannel = reactive({ number: null, name: '' });

async function load() {
  channels.value = await api.listChannels();
  for (const channel of channels.value) {
    const full = await api.getChannel(channel.id);
    ruleForms[channel.id] = full.rules[0]
      ? { ...full.rules[0] }
      : { rule_type: 'folder', rule_value: '', shuffle: false };
  }
}

async function createChannel() {
  await api.createChannel({ ...newChannel });
  newChannel.number = null;
  newChannel.name = '';
  await load();
}

async function saveRule(channel) {
  await api.setChannelRule(channel.id, ruleForms[channel.id]);
}

async function startChannel(channel) {
  await api.startChannel(channel.id);
}
async function stopChannel(channel) {
  await api.stopChannel(channel.id);
}
async function restartChannel(channel) {
  await api.restartChannel(channel.id);
}

onMounted(load);
</script>

<style scoped>
.channel-card { border: 1px solid #333; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
form { display: flex; gap: 0.5rem; align-items: center; margin: 0.5rem 0; }
</style>
