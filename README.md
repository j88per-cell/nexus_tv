# Nexus (nexus.tv)

A personal fake-TV service: multiple channels, each continuously streaming a curated
rotation of your existing movie/TV library over HLS — no transcoding of your library,
just Liquidsoap combining pre-encoded files into a live stream per channel.

- **SQLite** stores the media library index, channels, per-channel rule (folder-shuffle
  for movies, or show-chronological for TV, including multi-part episode grouping), manual
  pin/exclude overrides, and a rolling ~48h generated schedule per channel (which doubles as
  the EPG data for the guide view).
- **Express (`backend/`)** exposes the JSON API, runs the media scanner and schedule
  generator, and manages one Liquidsoap process per channel.
- **Liquidsoap** pulls "what's next" from the API (`GET /api/channels/:id/next-file`) and
  writes HLS segments to disk; nginx serves those statically.
- **Vue 3 (`frontend/`)** is the admin UI: library browser, channel/rule/override
  management, and the on-now/up-next guide.

## Local setup

```
npm install
cp .env.example .env    # defaults work out of the box; adjust MEDIA_ROOTS etc.
npm run migrate         # creates the SQLite database at SQLITE_PATH
npm run scan            # walks MEDIA_ROOTS and populates media_files
npm run dev:backend
npm run dev:frontend
```

## Deploying

A typical deploy target is a `git pull` working checkout at `/opt/nexus` on your server. To
deploy: push to your remote, then on the server `cd /opt/nexus && git pull`, `npm install`,
`npm run migrate`, `npm run build:frontend`, and restart the supervisor job.

- `deploy/supervisor-nexus.conf.example` — sample supervisor config for the API process.
- `deploy/nginx-nexus.conf.example` — sample nginx config serving the built SPA, proxying
  `/api/`, and serving `/streams/` (the HLS output directory) statically.
- The SQLite database file lives wherever `SQLITE_PATH` points (default `./data/nexus.sqlite3`,
  relative to wherever the backend process starts) — back that file up like any other app data.
- Liquidsoap needs to be installed on the host; Nexus runs one process per channel, each
  writing to its own HLS output directory under `HLS_ROOT`.

## Known MVP limitations

- One rule per channel (folder-shuffle or show-chronological) — no mixing multiple rules yet.
- No seek-to-offset on channel start — Liquidsoap always plays the next scheduled item from
  0:00, so posted EPG times are a close approximation of real playback, not a hard guarantee.
- No online metadata (TMDB/IMDB) yet — titles/season/episode come from filename/folder parsing.
