#!/bin/bash
# Обновление Lodl с GitHub: сайт обновляется сразу, сервер перезапускается, только если менялся его код.
set -euo pipefail
R=/opt/lodl/repo
cd $R
OLD=$(git rev-parse HEAD)
git fetch -q origin main || exit 0
NEW=$(git rev-parse origin/main)
[ "$OLD" = "$NEW" ] && exit 0
git reset -q --hard "$NEW"
chown -R lodl:lodl $R
if git diff --name-only "$OLD" "$NEW" | grep -q '^server/'; then
  if git diff --name-only "$OLD" "$NEW" | grep -q '^server/package'; then (cd server && /usr/local/bin/npm ci --omit=dev --no-audit --no-fund -q); chown -R lodl:lodl $R; fi
  install -m 755 server/deploy/update.sh /usr/local/bin/lodl-update
  install -m 755 server/deploy/link.sh /usr/local/bin/lodl-link
  systemctl restart lodl
fi
echo "Lodl обновлён до ${NEW:0:7}"
