#!/bin/sh
# Nightly channel shutoff (weeknights only — Friday/Saturday nights excluded). Installed via
# cron:
#   0 0 * * 1-5 /opt/nexus/deploy/nightly-off.sh >> /opt/nexus/nightly-off.log 2>&1
# Each channel stops gracefully after its currently-playing item finishes, not immediately.
curl -s -X POST http://localhost:4100/api/channels/stop-scheduled
echo
