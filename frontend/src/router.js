import { createRouter, createWebHistory } from 'vue-router';
import LandingView from './views/LandingView.vue';
import EpgView from './views/EpgView.vue';
import ChannelsView from './views/ChannelsView.vue';
import LibraryView from './views/LibraryView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LandingView },
    { path: '/guide', component: EpgView },
    { path: '/channels', component: ChannelsView },
    { path: '/library', component: LibraryView },
  ],
});
