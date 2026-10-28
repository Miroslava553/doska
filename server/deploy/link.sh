#!/bin/bash
# Новая одноразовая ссылка на страницу настроек (ключи ЮKassa и почта)
set -e
head -c 24 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=' > /etc/lodl/setup-token
chown lodl:lodl /etc/lodl/setup-token; chmod 600 /etc/lodl/setup-token
D=$(sed -n 's#^SITE_URL=##p' /etc/lodl/env)
echo; echo "  Откройте в браузере: $D/setup/$(cat /etc/lodl/setup-token)"; echo
