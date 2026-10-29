#!/bin/bash
# Установка Lodl на чистый сервер Ubuntu 24.04. Запуск одной командой в консоли сервера:
#   curl -fsSL https://miroslava553.github.io/doska/s | bash
# Скрипт можно запускать повторно: он ничего не ломает и только доустанавливает недостающее.
set -euo pipefail
REPO=${REPO:-https://github.com/Miroslava553/doska.git}
APP=/opt/lodl; DATA=/var/lib/lodl; CONF=/etc/lodl
NODE_VER=22.20.0
say() { printf '\n\033[1;34m%s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Запустите от имени root (в консоли Timeweb вы и так root)"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

DOMAIN="${DOMAIN:-}"
if [ -z "$DOMAIN" ] && [ -f $CONF/env ]; then DOMAIN=$(sed -n 's#^SITE_URL=https://##p' $CONF/env); fi
if [ -z "$DOMAIN" ]; then
  printf 'Введите домен сайта, например lodl.ru: '; read -r DOMAIN < /dev/tty
fi
DOMAIN=$(echo "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*##; s#^www\.##')
[ -n "$DOMAIN" ] || { echo "Домен не введён"; exit 1; }

say "1/7 Обновляем систему и ставим нужные программы"
apt-get update -q
apt-get install -y -q git curl ca-certificates caddy sqlite3 ufw unattended-upgrades xz-utils >/dev/null

say "2/7 Ставим Node.js $NODE_VER"
if ! /usr/local/bin/node -v 2>/dev/null | grep -q "^v22"; then
  ARCH=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
  F=node-v$NODE_VER-linux-$ARCH.tar.xz
  curl -fsSL "https://nodejs.org/dist/v$NODE_VER/$F" -o /tmp/$F || curl -fsSL "https://npmmirror.com/mirrors/node/v$NODE_VER/$F" -o /tmp/$F
  tar -xJf /tmp/$F -C /usr/local --strip-components=1 && rm /tmp/$F
fi
/usr/local/bin/node -v

say "3/7 Забираем Lodl с GitHub"
git config --global --add safe.directory $APP/repo 2>/dev/null || true
id lodl >/dev/null 2>&1 || useradd --system --home $DATA --shell /usr/sbin/nologin lodl
mkdir -p $APP $DATA $CONF
if [ -d $APP/repo/.git ]; then git -C $APP/repo fetch -q origin && git -C $APP/repo reset -q --hard origin/main
else git clone -q --depth 50 $REPO $APP/repo; fi
(cd $APP/repo/server && /usr/local/bin/npm ci --omit=dev --no-audit --no-fund -q)
chown -R lodl:lodl $DATA $APP; chmod 750 $DATA

say "4/7 Настройки"
if [ ! -f $CONF/env ]; then
  printf 'SITE_URL=https://%s\nDATA_DIR=%s\nPORT=3000\nAUTOPAY=1\n' "$DOMAIN" "$DATA" > $CONF/env
fi
sed -i "s#^SITE_URL=.*#SITE_URL=https://$DOMAIN#" $CONF/env
head -c 24 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=' > $CONF/setup-token
chown -R lodl:lodl $CONF; chmod 700 $CONF; chmod 600 $CONF/env $CONF/setup-token

say "5/7 Запускаем сервер"
cat > /etc/systemd/system/lodl.service <<EOF
[Unit]
Description=Lodl
After=network-online.target
[Service]
User=lodl
EnvironmentFile=$CONF/env
Environment=NODE_ENV=production ENV_FILE=$CONF/env SETUP_TOKEN_FILE=$CONF/setup-token
ExecStart=/usr/local/bin/node --no-warnings $APP/repo/server/index.js
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA $CONF
[Install]
WantedBy=multi-user.target
EOF
# автообновление: раз в две минуты берём новую версию с GitHub
install -m 755 $APP/repo/server/deploy/update.sh /usr/local/bin/lodl-update
install -m 755 $APP/repo/server/deploy/link.sh /usr/local/bin/lodl-link
cat > /etc/systemd/system/lodl-update.service <<EOF
[Unit]
Description=Обновление Lodl с GitHub
[Service]
Type=oneshot
ExecStart=/usr/local/bin/lodl-update
EOF
cat > /etc/systemd/system/lodl-update.timer <<EOF
[Unit]
Description=Обновление Lodl раз в две минуты
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF
# копия базы каждую ночь, хранятся две недели
cat > /etc/systemd/system/lodl-backup.service <<EOF
[Unit]
Description=Копия базы Lodl
[Service]
Type=oneshot
User=lodl
ExecStart=/bin/sh -c 'mkdir -p $DATA/backup && sqlite3 $DATA/lodl.db ".backup $DATA/backup/lodl-\$(date +%%F).db" && find $DATA/backup -name "lodl-*.db" -mtime +14 -delete'
EOF
cat > /etc/systemd/system/lodl-backup.timer <<EOF
[Unit]
Description=Копия базы Lodl каждую ночь
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable -q --now lodl.service lodl-update.timer lodl-backup.timer
systemctl restart lodl.service

say "6/7 Включаем HTTPS для $DOMAIN"
# другой веб-сервер (например, nginx с заглушкой) занимает нужные порты: выключаем его
for w in nginx apache2 httpd; do
  if systemctl is-active -q $w 2>/dev/null || systemctl is-enabled -q $w 2>/dev/null; then
    echo "Выключаем $w"; systemctl disable --now $w || true
  fi
done
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
	handle /api/* {
		request_body {
			max_size 210MB
		}
		reverse_proxy 127.0.0.1:3000 {
			header_up X-Real-IP {remote_host}
		}
	}
	handle /setup/* {
		reverse_proxy 127.0.0.1:3000
	}
	handle {
		root * $APP/repo/lodl
		@fresh path / /index.html /version.json
		header @fresh Cache-Control "no-cache"
		file_server
	}
}
www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF
systemctl enable -q caddy && systemctl reload caddy || systemctl restart caddy

say "7/7 Защита сервера"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable -q --now unattended-upgrades || true

IP=$(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
sleep 2
if systemctl is-active -q lodl; then OK="работает"; else OK="НЕ запустился, пришлите вывод команды: journalctl -u lodl -n 50"; fi
cat <<EOF

=====================================================================
  Сервер Lodl $OK.

  1. В настройках домена $DOMAIN добавьте запись A со значением $IP
     (и такую же для www.$DOMAIN). Сертификат HTTPS выпустится сам
     через несколько минут после этого.

  2. Откройте эту ссылку в обычном браузере и вставьте ключи ЮKassa
     и почту:

     https://$DOMAIN/setup/$(cat $CONF/setup-token)

  Если ссылка потерялась, новую покажет команда: lodl-link
=====================================================================
EOF
