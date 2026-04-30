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
REMOTE_PHP_CGI="/usr/bin/php-fcgi8.5"
BUILD_DIR="$(mktemp -d)"

case "$ENV_NAME" in
  staging)
    LOCAL_ENV_FILE="$ROOT_DIR/.env.staging"
    APP_DIR="$REMOTE_BASE/app-staging"
    DOCROOT="$REMOTE_BASE/public_html/dev.sugutachi.com"
    APP_URL="https://dev.sugutachi.com"
    APP_ENV_VALUE="staging"
    APP_DEBUG_VALUE="true"
    MAIL_FROM_ADDRESS="noreply-dev@sugutachi.com"
    SUPPORT_EMAIL="support@sugutachi.com"
    ;;
  production)
    LOCAL_ENV_FILE="$ROOT_DIR/.env.prod"
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

if ! command -v composer >/dev/null 2>&1; then
  echo "composer command is required on the local machine."
  exit 1
fi

if [[ ! -d "$ROOT_DIR/public/build" ]]; then
  echo "public/build does not exist. Run npm run build first."
  exit 1
fi

TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"; rm -rf "$BUILD_DIR"' EXIT
if [[ -f "$LOCAL_ENV_FILE" ]]; then
  echo "Using local env file: $(basename "$LOCAL_ENV_FILE")"
  cp "$LOCAL_ENV_FILE" "$TMP_ENV"
  ENV_SOURCE_MODE="managed"
else
  echo "No $(basename "$LOCAL_ENV_FILE") found. Falling back to .env.example bootstrap."
  cp "$ROOT_DIR/.env.example" "$TMP_ENV"
  ENV_SOURCE_MODE="bootstrap"
fi

python3 - "$TMP_ENV" "$APP_ENV_VALUE" "$APP_DEBUG_VALUE" "$APP_URL" "$MAIL_FROM_ADDRESS" "$SUPPORT_EMAIL" "$ENV_SOURCE_MODE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
app_env = sys.argv[2]
app_debug = sys.argv[3]
app_url = sys.argv[4]
mail_from = sys.argv[5]
support_email = sys.argv[6]
env_source_mode = sys.argv[7]

replacements = {
    "APP_ENV": app_env,
    "APP_DEBUG": app_debug,
    "APP_URL": app_url,
    "SERVICE_BASE_URL": app_url,
    "SERVICE_DOMAIN": app_url.replace("https://", "").replace("http://", ""),
    "MAIL_FROM_ADDRESS": f"\"{mail_from}\"",
    "SERVICE_SUPPORT_EMAIL": support_email,
}

lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
seen = set()
normalized = []
for line in lines:
    replaced = False
    for key, value in replacements.items():
        if line.startswith(f"{key}="):
            normalized.append(f"{key}={value}")
            seen.add(key)
            replaced = True
            break
    if not replaced:
        normalized.append(line)

for key, value in replacements.items():
    if key not in seen:
        normalized.append(f"{key}={value}")

if env_source_mode == "managed":
    values = {}
    for line in normalized:
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"')
    if not values.get("APP_KEY"):
        raise SystemExit(
            "Managed env file is missing APP_KEY. Put the fixed environment APP_KEY into the local env file before deploying."
        )

path.write_text("\n".join(normalized) + "\n", encoding="utf-8")
PY

echo "Preparing production-ready artifact locally ..."
rsync -a \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  --exclude 'storage/logs/*' \
  --exclude 'storage/app/*' \
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
  "$ROOT_DIR/" "$BUILD_DIR/"

(cd "$BUILD_DIR" && composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader)

echo "Syncing application files to $ENV_NAME ..."
rsync -az --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'storage/logs/*' \
  --exclude 'storage/app/*' \
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
  "$BUILD_DIR/" "$REMOTE_HOST:$APP_DIR/"

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

echo "Syncing public assets to docroot ..."
ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
  rsync -a --delete \
    --exclude '.user.ini' \
    --exclude 'index.php' \
    --exclude '.htaccess' \
    --exclude 'php85.cgi' \
    '$APP_DIR/public/' '$DOCROOT/' && \
  ln -sfn '$APP_DIR/storage/app/public' '$DOCROOT/storage'
"

if [[ "$ENV_SOURCE_MODE" == "managed" ]]; then
  echo "Uploading managed env file to remote .env ..."
  scp -P "$REMOTE_PORT" "$TMP_ENV" "$REMOTE_HOST:$APP_DIR/.env"
else
  echo "Uploading bootstrap .env if missing ..."
  scp -P "$REMOTE_PORT" "$TMP_ENV" "$REMOTE_HOST:$APP_DIR/.env.bootstrap"
  ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
    if [ ! -f '$APP_DIR/.env' ]; then
      mv '$APP_DIR/.env.bootstrap' '$APP_DIR/.env'
    else
      rm '$APP_DIR/.env.bootstrap'
    fi
  "
fi

echo "Generating app key if needed ..."
ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
  cd '$APP_DIR' && \
  if ! grep -q '^APP_KEY=base64:' .env; then
    '$REMOTE_PHP' artisan key:generate --force
  fi
"

if [[ "$ACTIVATE_DOCROOT" == true ]]; then
  echo "Activating Laravel public files in docroot ..."
  INDEX_WRAPPER="$(mktemp)"
  HTACCESS_WRAPPER="$(mktemp)"
  trap 'rm -f "$TMP_ENV" "$INDEX_WRAPPER" "$HTACCESS_WRAPPER"' EXIT
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

  cp "$ROOT_DIR/public/.htaccess" "$HTACCESS_WRAPPER"

  scp -P "$REMOTE_PORT" "$INDEX_WRAPPER" "$REMOTE_HOST:$DOCROOT/index.php"
  scp -P "$REMOTE_PORT" "$HTACCESS_WRAPPER" "$REMOTE_HOST:$DOCROOT/.htaccess"

  ssh -p "$REMOTE_PORT" "$REMOTE_HOST" "
    cat > '$DOCROOT/php85.cgi' <<'SH'
#!/usr/bin/sh
exec $REMOTE_PHP_CGI
SH
    chmod 755 '$DOCROOT/php85.cgi'
    python3 - <<'PY'
from pathlib import Path
    p = Path('$DOCROOT/.htaccess')
    lines = p.read_text(encoding='utf-8', errors='ignore').splitlines() if p.exists() else []
filtered = []
for line in lines:
    if 'myphp-script85' in line:
        continue
    if line.startswith('Action myphp-script85'):
        continue
    if line.startswith('AddHandler myphp-script85'):
        continue
    filtered.append(line)
header = [
    'Action myphp-script85 /php85.cgi',
    'AddHandler myphp-script85 .php',
]
p.write_text('\\n'.join(header + filtered) + '\\n', encoding='utf-8')
PY
  "
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
