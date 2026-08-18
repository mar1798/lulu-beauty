#!/usr/bin/env bash
#
# Бэкап продового стека Lulu Beauty: база (pg_dump) + фотографии товаров
# (том `uploads`). Состояние живёт только в этих двух местах — потеря второго
# оставит в БД строки product_images, указывающие в пустоту.
#
# Запуск вручную:
#
#   ./deploy/backup.sh
#
# Раз в сутки по cron (от пользователя `deploy`, `crontab -e`):
#
#   17 3 * * * /home/deploy/lulu-beauty/deploy/backup.sh >> /home/deploy/backup.log 2>&1
#
# Настройки — переменными окружения (значения по умолчанию в скобках):
#
#   BACKUP_DIR     куда складывать архивы           ($HOME/lulu-backups)
#   KEEP_DAYS      сколько дней хранить локально    (14)
#   BACKUP_REMOTE  rclone-remote для выгрузки       (пусто — только локально)
#                  например: r2:lulu-backups  или  s3:my-bucket/lulu
#   ENV_FILE       путь к .env.prod                 (<корень репозитория>/.env.prod)
#
# ⚠️ Бэкап, лежащий на том же сервере, от потери сервера не спасает.
# Пока BACKUP_REMOTE не задан, скрипт об этом предупреждает при каждом запуске.
#
# Восстановление — deploy/restore.sh (см. также «Шаг 9» в DEPLOY.md):
#
#   ./deploy/restore.sh ~/lulu-backups/db-2026-08-18-0317.sql.gz \
#                       ~/lulu-backups/uploads-2026-08-18-0317.tar.gz

set -Eeuo pipefail

# Корень репозитория — на два уровня выше самого скрипта, поэтому запускать его
# можно из любой директории (в том числе из cron, где $PWD — домашняя папка).
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$HOME/lulu-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.prod.yml")

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ОШИБКА: $*"; exit 1; }

# Любой обрыв на середине оставляет недописанные архивы — убираем их, чтобы
# битый файл не выглядел как валидный бэкап.
cleanup_failed() {
  local code=$?
  [[ $code -eq 0 ]] && return 0
  rm -f "${DB_TMP:-}" "${UPLOADS_TMP:-}"
  log "прервано с кодом $code, незавершённые файлы удалены"
}
trap cleanup_failed EXIT

[[ -f "$ENV_FILE" ]] || die "не найден $ENV_FILE"
command -v docker >/dev/null || die "docker не установлен"

mkdir -p "$BACKUP_DIR"

# Два бэкапа одновременно (cron наложился на ручной запуск) не нужны: второй
# просто выходит, а не борется за место и IO.
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { log "другой бэкап уже идёт — выхожу"; exit 0; }

STAMP="$(date +%F-%H%M)"
DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
DB_TMP="$DB_FILE.part"
UPLOADS_TMP="$UPLOADS_FILE.part"

log "бэкап в $BACKUP_DIR"

# --- База --------------------------------------------------------------------
# Имя пользователя и базы берём из окружения самого контейнера, а не парсим
# .env.prod: там они опциональны (в compose есть значения по умолчанию).
log "pg_dump…"
# Одинарные кавычки намеренно: $POSTGRES_USER/$POSTGRES_DB должны раскрыться
# внутри контейнера, а не здесь.
# shellcheck disable=SC2016
"${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$DB_TMP"

# pg_dump в конвейере может упасть уже после того, как gzip создал файл, —
# `set -o pipefail` это ловит, но пустой/битый архив проверяем отдельно.
gzip -t "$DB_TMP" || die "дамп базы повреждён"
[[ -s "$DB_TMP" ]] || die "дамп базы пустой"
mv "$DB_TMP" "$DB_FILE"
log "база: $(du -h "$DB_FILE" | cut -f1)"

# --- Фотографии --------------------------------------------------------------
# Читаем том через сам контейнер api, чтобы не угадывать имя тома (оно зависит
# от имени директории проекта: <project>_uploads).
log "архив uploads…"
"${COMPOSE[@]}" exec -T api tar czf - -C /app/uploads . > "$UPLOADS_TMP"

gzip -t "$UPLOADS_TMP" || die "архив фотографий повреждён"
mv "$UPLOADS_TMP" "$UPLOADS_FILE"
log "фотографии: $(du -h "$UPLOADS_FILE" | cut -f1)"

trap - EXIT

# --- Выгрузка наружу ---------------------------------------------------------
if [[ -n "$BACKUP_REMOTE" ]]; then
  command -v rclone >/dev/null || die "BACKUP_REMOTE задан, но rclone не установлен"
  log "rclone → $BACKUP_REMOTE"
  rclone copy "$DB_FILE" "$BACKUP_REMOTE" --no-traverse
  rclone copy "$UPLOADS_FILE" "$BACKUP_REMOTE" --no-traverse
  # Ротация на удалённой стороне: те же KEEP_DAYS, что и локально.
  rclone delete "$BACKUP_REMOTE" --min-age "${KEEP_DAYS}d" --include 'db-*.sql.gz' --include 'uploads-*.tar.gz'
  log "выгружено"
else
  log "ВНИМАНИЕ: BACKUP_REMOTE не задан — копии только на этом сервере."
  log "          Потеря сервера = потеря бэкапов. Настройте rclone-remote."
fi

# --- Ротация локальных копий -------------------------------------------------
# Страховочные копии от restore.sh (pre-restore-*) ротируются здесь же —
# отдельного расписания у них нет.
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' -o -name 'pre-restore-*' \) \
  -mtime "+$KEEP_DAYS" -print -delete | while read -r old; do
    log "удалён старый: $(basename "$old")"
  done

log "готово"
