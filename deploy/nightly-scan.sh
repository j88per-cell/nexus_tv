#!/bin/sh
# Nightly library rescan + schedule regeneration. Installed via cron:
#   0 1 * * * /opt/nexus/deploy/nightly-scan.sh >> /opt/nexus/nightly-scan.log 2>&1
set -e
cd /opt/nexus/backend
node src/scanner/cli.js
# Proxy generation (GPU/NVENC, falls back to CPU) is time-bounded, not count-bounded (see
# PROXY_TIME_BUDGET_MINUTES) — adjust the day/hour window below to whatever's clear on your
# host, e.g. avoiding hours other services need the GPU/CPU.
dow=$(date +%u)  # 1=Mon .. 7=Sun
if [ "$dow" -le 5 ]; then
  node src/proxy/cli.js
fi
node src/scheduler/cli.js
