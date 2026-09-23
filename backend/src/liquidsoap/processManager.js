const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'liquidsoap', 'channel.liq.template');
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

const running = new Map(); // channelId -> { process }

function render(channel) {
  const hlsDir = path.join(config.hlsRoot, String(channel.number));
  return template
    .replaceAll('{{CHANNEL_ID}}', String(channel.id))
    .replaceAll('{{CHANNEL_NUMBER}}', String(channel.number))
    .replaceAll('{{CHANNEL_NAME}}', channel.name)
    .replaceAll('{{API_BASE_URL}}', config.apiBaseUrl)
    .replaceAll('{{HLS_DIR}}', hlsDir);
}

function liqPathFor(channel) {
  return path.join(config.liqConfigRoot, `channel-${channel.number}.liq`);
}

// A PID file (rather than only the in-memory `running` map) is what makes stop/start
// resilient across a Nexus API restart — otherwise a Liquidsoap child spawned by a
// previous server process becomes untracked and orphaned, and a later start() for the
// same channel ends up with two processes writing into the same HLS directory at once.
function pidPathFor(channel) {
  return path.join(config.liqConfigRoot, `channel-${channel.number}.pid`);
}

function writeConfig(channel) {
  const hlsDir = path.join(config.hlsRoot, String(channel.number));
  fs.mkdirSync(hlsDir, { recursive: true });
  fs.mkdirSync(config.liqConfigRoot, { recursive: true });
  const liqPath = liqPathFor(channel);
  fs.writeFileSync(liqPath, render(channel));
  return liqPath;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killExistingProcess(channel) {
  const pidPath = pidPathFor(channel);
  const entry = running.get(channel.id);
  let pid = entry ? entry.process.pid : null;
  if (!pid && fs.existsSync(pidPath)) {
    pid = parseInt(fs.readFileSync(pidPath, 'utf8'), 10);
  }

  if (pid && isAlive(pid)) {
    process.kill(pid, 'SIGTERM');
    const deadline = Date.now() + 3000;
    while (isAlive(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (isAlive(pid)) process.kill(pid, 'SIGKILL');
  }

  running.delete(channel.id);
  if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
}

async function stop(channel) {
  await killExistingProcess(channel);
  return true;
}

async function start(channel) {
  await killExistingProcess(channel);
  const liqPath = writeConfig(channel);
  const proc = spawn(config.liquidsoapBin, [liqPath], { stdio: 'inherit' });
  fs.writeFileSync(pidPathFor(channel), String(proc.pid));
  proc.on('exit', (code) => {
    console.log(`liquidsoap for channel ${channel.number} exited with code ${code}`);
    running.delete(channel.id);
    const pidPath = pidPathFor(channel);
    if (fs.existsSync(pidPath) && fs.readFileSync(pidPath, 'utf8') === String(proc.pid)) {
      fs.unlinkSync(pidPath);
    }
  });
  running.set(channel.id, { process: proc });
  return proc.pid;
}

async function restart(channel) {
  return start(channel);
}

function status(channel) {
  const pidPath = pidPathFor(channel);
  if (fs.existsSync(pidPath)) {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8'), 10);
    if (isAlive(pid)) return { running: true, pid };
  }
  return { running: false };
}

module.exports = { start, stop, restart, status };
