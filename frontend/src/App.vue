<template>
  <div class="app">
    <nav>
      <span class="brand">Nexus.tv</span>
      <router-link to="/">Home</router-link>
      <router-link to="/guide">Guide</router-link>
      <router-link to="/channels">Channels</router-link>
      <router-link to="/library">Library</router-link>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style>
  body { margin: 0; font-family: 'Archivo', system-ui, sans-serif; background: #111; color: #eee; }
  nav { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1rem; background: #1a1a1a; border-bottom: 1px solid #333; }
  nav a { color: #ccc; text-decoration: none; }
  nav a.router-link-active { color: #fff; font-weight: 600; }
  .brand { font-weight: 700; margin-right: 1rem; }
  main { padding: 1rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #2a2a2a; }
  button { background: #2a2a2a; color: #eee; border: 1px solid #444; padding: 0.3rem 0.7rem; border-radius: 4px; cursor: pointer; }
  button:hover { background: #333; }
  input, select { background: #1a1a1a; color: #eee; border: 1px solid #444; padding: 0.3rem; border-radius: 4px; }
</style>
