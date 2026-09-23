<template>
  <video ref="videoEl" class="player" autoplay muted controls playsinline @click.stop></video>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import Hls from 'hls.js';

const props = defineProps({ src: { type: String, required: true } });

const videoEl = ref(null);
let hls = null;

function attach(src) {
  destroy();
  const video = videoEl.value;
  if (!video) return;

  if (Hls.isSupported()) {
    hls = new Hls({ lowLatencyMode: false });
    hls.loadSource(src);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari plays HLS natively, no hls.js needed.
    video.src = src;
  }
}

function destroy() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

onMounted(() => attach(props.src));
watch(() => props.src, (src) => attach(src));
onBeforeUnmount(destroy);
</script>

<style scoped>
.player {
  width: 100%;
  height: 100%;
  background: #000;
  display: block;
}
</style>
