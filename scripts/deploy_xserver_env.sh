#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <staging|production> [--activate-docroot] [--migrate]"
  exit 1
fi

ENV_NAME="$1"
shift

ACTIVATE_DOCROOT=false
RUN_MIGRATIONS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --activate-docroot)
      ACTIVATE_DOCROOT=true
      ;;
    --migrate)
      RUN_MIGRATIONS=true
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
  shift
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="hnice2204@sv13399.xserver.jp"
REMOTE_PORT="10022"
REMOTE_BASE="/home/hnice2204/sugutachi.com"
REMOTE_PHP="/usr/bin/php8.5"

case "$ENV_NAME" in
  staging)
    APP_DIR="$REMOTE_BASE/app-staging"
    DOCROOT="$REMOTE_BASE/public_html/dev.sugutachi.com"
    APP_URL="https://dev.sugutachi.com"
    APP_ENV_VALUE="staging"
    APP_DEBUG_VALUE="true"
    MAIL_FROM_ADDRESS="noreply-dev@sugutachi.com"
    SUPPORT_EMAIL="support@sugutachi.com"
    ;;
  production)
    APP_DIR="$REMOTE_BASE/app-production"
    DOCROOT="$REMOTE_BASE/public_html"
    APP_URL="https://sugutachi.com"
    APP_ENV_VALUE="production"
    APP_DEBUG_VALUE="false"
    MAIL_FROM_ADDRESS="noreply@sugutachi.com"
    SUPPORT_EMAIL="support@sugutachi.com"
    ;;
  *)
    echo "Environment must be staging or production"
    exit 1
    ;;
esac

if [[ ! -d "$ROOT_DIR/vendor" ]]; then
  echo "vendor/ does not exist. Run composer install first."
  exit 1
fi

if [[ ! -d "$ROOT_DIR/public/build" ]]; then
  echo "public/build does not exist. Run npm run build first."
  exit 1
fi

TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT
cp "$ROOT_DIR/.env.example" "$TMP_ENV"

python3 - "$TMP_ENV" "$APP_ENV_VALUE" "$APP_DEBUG_VALUE" "$APP_URL" "$MAIL_FROM_ADDRESS" "$SUPPORT_EMAIL" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
app_env = sys.argv[2]
app_debug = sys.argv[3]
app_url = sys.argv[4]
mail_from = sys.argv[5]
support_email = sys.argv[6]

replacements = {
    "APP_ENV": app_env,
    "APP_DEBUG": app_debug,
    "APP_URL": app_url,
    "SERVICE_BASE_URL": app_url,
    "SERVICE_DOMAIN": app_url.replace("https://", "").replace("http://", ""),
    "MAIL_FROM_ADDRESS": f"\"{mail_from}\"",
    "SERVICE_SUPPORT_EMAIL": support_email,
    "GTM_ENABLED": "false",
}

lines = []
for line in path.read_text().splitlines():
    replaced = False
    for key, value in replacements.items():
        if line.startswith(f"{key}="):
            lines.append(f"{key}={value}")
            replaced = True
            break
    if not replaced:
        lines.append(line)

path.write_text("\n".join(lines) + "\n")
PY

echo "Syncing application files to $ENV_NAME ..."
rsync -az --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude 'storage/logs/*' \
  --exclude 'storage/framework/cache/*' \
  --exclude 'storage/framework/sessions/*' \
  --exclude 'storage/framework/views/*' \
  --exclude 'storage/framework/testing/*' \
  --exclude 'storage/pail' \
  --exclude 'public/hot' \
  --exclude 'public/storage' \
  --exclude 'tests' \
  --exclude 'tmp' \
  --exclude '.codex' \
  --exclude '.cursor' \
  --exclude '.idea' \
  --exclude '.vscode' \
  -e "ssh -p $REMOTE_PORT" \
  "$ROOT_DIR/" "$REMOTE_HOST:$APP_DIR/"

echo "Preparing runtime directories on server ..."
ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
  mkdir -p '$APP_DIR/storage/app/public' \
           '$APP_DIR/storage/framework/cache' \
           '$APP_DIR/storage/framework/sessions' \
           '$APP_DIR/storage/framework/views' \
           '$APP_DIR/storage/framework/testing' \
           '$APP_DIR/storage/logs' \
           '$APP_DIR/bootstrap/cache'
"

echo "Uploading bootstrap .env if missing ..."
scp -P "$REMOTE_PORT" "$TMP_ENV" "$REMOTE_HOST:$APP_DIR/.env.bootstrap"
ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
  if [ ! -f '$APP_DIR/.env' ]; then
    mv '$APP_DIR/.env.bootstrap' '$APP_DIR/.env'
  else
    rm '$APP_DIR/.env.bootstrap'
  fi
"

echo "Generating app key if needed ..."
ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
  cd '$APP_DIR' && \
  if ! grep -q '^APP_KEY=base64:' .env; then
    '$REMOTE_PHP' artisan key:generate --force
  fi
"

if [[ "$ACTIVATE_DOCROOT" == true ]]; then
  echo "Activating Laravel public files in docroot ..."
  ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
    rsync -a --delete --exclude '.user.ini' --exclude 'index.php' '$APP_DIR/public/' '$DOCROOT/' && \
    ln -sfn '$APP_DIR/storage/app/public' '$DOCROOT/storage'
  "

  INDEX_WRAPPER="$(mktemp)"
  trap 'rm -f "$TMP_ENV" "$INDEX_WRAPPER"' EXIT
  cat > "$INDEX_WRAPPER" <<PHP
<?php

use Illuminate\\Foundation\\Application;
use Illuminate\\Http\\Request;

define('LARAVEL_START', microtime(true));

\$appRoot = '$APP_DIR';

if (file_exists(\$maintenance = \$appRoot.'/storage/framework/maintenance.php')) {
    require \$maintenance;
}

require \$appRoot.'/vendor/autoload.php';

/** @var Application \$app */
\$app = require_once \$appRoot.'/bootstrap/app.php';

\$app->handleRequest(Request::capture());
PHP

  scp -P "$REMOTE_PORT" "$INDEX_WRAPPER" "$REMOTE_HOST:$DOCROOT/index.php"
fi

if [[ "$RUN_MIGRATIONS" == true ]]; then
  echo "Running migrations ..."
  ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "cd '$APP_DIR' && '$REMOTE_PHP' artisan migrate --force"
fi

echo "Done."
echo "- App dir: $APP_DIR"
echo "- Docroot: $DOCROOT"
echo "- Activate docroot: $ACTIVATE_DOCROOT"
echo "- Run migrations: $RUN_MIGRATIONS"
