const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const db = require('../db');
const config = require('../config');

// -bf 0 (no B-frames) is required for Liquidsoap's copy-mode ("stream-copy", zero-CPU) live
// playback: B-frames need DTS != PTS reordering, and NVENC's handling of that reordering was
// producing genuinely non-monotonic DTS that copy-mode's strict validator rejects outright
// (an opaque infinite retry loop, not a helpful error) — confirmed by testing, not a guess.
const COMMON_ARGS = ['-map', '0:v:0', '-map', '0:a:0?', '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr', '-bf', '0', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'];

// NVENC is ~4x faster than the CPU path and barely touches CPU (~16x realtime measured on
// an RTX 3060 vs ~4x for libx264 medium), so it's tried first. Falls back to CPU if
// the GPU/driver isn't usable that night (e.g. a broken NVIDIA userspace install) so a
// driver hiccup degrades the nightly batch to "slower" rather than "every file fails".
// CPU fallback is capped to a modest thread count so a handful of concurrent fallback jobs
// (see proxyConcurrency below) can't each grab most of the box's cores at once — confirmed
// necessary the hard way: an uncapped libx264 job on a 2h+ file pulled ~12 cores by itself.
const ENCODERS = [
  { name: 'nvenc', args: ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '20'] },
  { name: 'cpu', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-threads', '4'] },
];

function runFfmpeg(encoderArgs, absolutePath, outPath) {
  // -f mp4 is required because outPath is a .tmp file at this point (see proxyOneFile) —
  // ffmpeg can't infer a container from that extension and otherwise fails to open the muxer.
  const args = ['-y', '-i', absolutePath, ...encoderArgs, ...COMMON_ARGS, '-f', 'mp4', outPath];
  return new Promise((resolve, reject) => {
    execFile(config.ffmpegBin, args, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.slice(-2000) || err.message));
      resolve();
    });
  });
}

// Offline re-encode: preserves native resolution (no forced canvas, unlike the live
// Liquidsoap output) and uses a real preset since it isn't real-time constrained.
// CFR output also sidesteps the VFR-stutter issue seen with some library files.
async function encodeProxy(absolutePath, outPath) {
  let lastErr;
  for (const encoder of ENCODERS) {
    try {
      await runFfmpeg(encoder.args, absolutePath, outPath);
      return encoder.name;
    } catch (err) {
      lastErr = err;
      console.warn(`${encoder.name} encode failed for ${absolutePath}, trying next: ${err.message.split('\n')[0]}`);
    }
  }
  throw lastErr;
}

function proxyPathFor(absolutePath) {
  const root = config.mediaRoots.find((r) => absolutePath.startsWith(`${r}/`));
  if (!root) throw new Error(`No configured media root contains ${absolutePath}`);
  const relative = path.relative(root, absolutePath);
  const parsed = path.parse(relative);
  return path.join(config.proxyRoot, parsed.dir, `${parsed.name}.mp4`);
}

async function proxyOneFile(file) {
  const outPath = proxyPathFor(file.absolute_path);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  // Encode to a .tmp path first so a crash/kill mid-encode can never leave a
  // corrupt file at the final path for the scheduler to pick up.
  const tmpPath = `${outPath}.tmp`;
  const encoder = await encodeProxy(file.absolute_path, tmpPath);
  await fs.rename(tmpPath, outPath);
  return { outPath, encoder };
}

// Time-bounded rather than count-bounded: a fixed file count either wastes most of the safe
// GPU window (movies take ~8min each, so 25/night barely used a fraction of a 6-hour window)
// or risks overshooting it (an unlucky run of long files). maxFiles is just a sane upper
// safety cap, not the real limiter.
//
// Runs `concurrency` files at once — confirmed by hand-testing that an RTX 3060/driver
// has no consumer NVENC session cap (4 concurrent encodes all ran fine), so this is close to
// a free multiplier on throughput as long as NVENC stays healthy. If NVENC is down, every
// concurrent worker falls back to CPU at once; the -threads 4 cap above keeps that survivable
// instead of oversubscribing the box's cores.
async function generateProxies({
  maxFiles = config.proxyMaxFiles,
  timeBudgetMs = config.proxyTimeBudgetMinutes * 60 * 1000,
  concurrency = config.proxyConcurrency,
} = {}) {
  const deadline = Date.now() + timeBudgetMs;
  // proxy_failed_at IS NULL: a file that failed both encoders isn't retried every single
  // night forever (wasting time budget on something that can't succeed as-is) — it's set
  // aside for manual attention. See backend/src/proxy/failures.js to list/retry them.
  const { rows: files } = await db.query(
    `SELECT * FROM media_files WHERE proxy_path IS NULL AND proxy_failed_at IS NULL
     AND last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')
     ORDER BY added_at ASC LIMIT $1`,
    [maxFiles]
  );

  let succeeded = 0;
  let attempted = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < files.length && Date.now() < deadline) {
      const file = files[nextIndex];
      nextIndex += 1;
      attempted += 1;
      try {
        const { outPath, encoder } = await proxyOneFile(file);
        await db.query(
          "UPDATE media_files SET proxy_path = $1, proxied_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $2",
          [outPath, file.id]
        );
        succeeded += 1;
        console.log(`Proxied (${encoder}): ${file.absolute_path} -> ${outPath}`);
      } catch (err) {
        console.error(`Proxy failed for ${file.absolute_path}: ${err.message}`);
        await db.query(
          "UPDATE media_files SET proxy_failed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), proxy_last_error = $1 WHERE id = $2",
          [err.message.slice(-1000), file.id]
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { attempted, succeeded };
}

module.exports = { generateProxies, proxyPathFor, proxyOneFile };
