#!/bin/sh
# Morning channel wake-up, paired with deploy/nightly-off.sh. Installed via cron:
#   0 10 * * 1-5 /opt/nexus/deploy/morning-on.sh >> /opt/nexus/morning-on.log 2>&1
curl -s -X POST http://localhost:4100/api/channels/start-scheduled
echo
