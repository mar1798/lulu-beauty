#!/usr/bin/env bash
#
# Восстановление продового стека Lulu Beauty из архивов, снятых
# deploy/backup.sh. База и фотографии восстанавливаются независимо — можно
# передать оба архива или только один.
#
#   ./deploy/restore.sh ~/lulu-backups/db-2026-08-18-0317.sql.gz \
#                       ~/lulu-backups/uploads-2026-08-18-0317.tar.gz
#
#   ./deploy/restore.sh --yes ~/lulu-backups/db-2026-08-18-0317.sql.gz
#
# Что происходит:
#   1. архивы проверяются (gzip -t), скрипт печатает план и спрашивает подтверждение;
#   2. снимается страховочная копия текущего состояния (pre-restore-*) —
#      отключается флагом --no-safety;
#   3. останавливаются `website` и `api`, чтобы никто не писал во время замены;
#   4. база пересоздаётся (DROP/CREATE) и наливается из дампа;
#   5. содержимое тома uploads заменяется целиком, владелец файлов чинится под
#      пользователя контейнера api;
#   6. сервисы поднимаются обратно.
#
# ⚠️ Операция разрушающая: текущие база и фотографии заменяются полностью.
# Восстановление «поверх» без DROP не делается намеренно — дамп pg_dump не
# содержит DROP-ов, и налив в непустую базу упал бы на конфликтах ключей,
# оставив половину старых и половину новых строк.
#
# Настройки — переменными окружения:
#
#   BACKUP_DIR   куда класть страховочную копию   ($HOME/lulu-backups)
#   ENV_FILE     путь к .env.prod                 (<корень репозитория>/.env.prod)

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/lulu-backups}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.prod.yml")

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ОШИБКА: $*"; exit 1; }

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

DB_ARCHIVE=''
UPLOADS_ARCHIVE=''
ASSUME_YES=false
SAFETY=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)    ASSUME_YES=true ;;
    --no-safety) SAFETY=false ;;
    -h|--help)   usage 0 ;;
    -*)          die "неизвестный флаг: $1" ;;
    *.sql.gz)    DB_ARCHIVE="$1" ;;
    *.tar.gz)    UPLOADS_ARCHIVE="$1" ;;
    *)           die "непонятный аргумент: $1 (ожидаются *.sql.gz и/или *.tar.gz)" ;;
  esac
  shift
done

[[ -n "$DB_ARCHIVE" || -n "$UPLOADS_ARCHIVE" ]] || usage 1
[[ -f "$ENV_FILE" ]] || die "не найден $ENV_FILE"
command -v docker >/dev/null || die "docker не установлен"

# Проверяем архивы до того, как что-либо остановлено: обнаружить битый дамп
# после DROP DATABASE — худший из возможных моментов.
for f in "$DB_ARCHIVE" "$UPLOADS_ARCHIVE"; do
  [[ -z "$f" ]] && continue
  [[ -f "$f" ]] || die "не найден архив: $f"
  gzip -t "$f" || die "архив повреждён: $f"
done

echo
echo "Восстановление Lulu Beauty. Текущие данные будут ЗАМЕНЕНЫ:"
[[ -n "$DB_ARCHIVE" ]]      && echo "  база        ← $DB_ARCHIVE ($(du -h "$DB_ARCHIVE" | cut -f1))"
[[ -n "$UPLOADS_ARCHIVE" ]] && echo "  фотографии  ← $UPLOADS_ARCHIVE ($(du -h "$UPLOADS_ARCHIVE" | cut -f1))"
$SAFETY && echo "  страховочная копия текущего состояния → $BACKUP_DIR/pre-restore-*"
echo

if ! $ASSUME_YES; then
  read -r -p 'Введите "restore" для продолжения: ' answer
  [[ "$answer" == 'restore' ]] || { log "отменено"; exit 1; }
fi

# Имя контейнера api нужно и для тома uploads (через --volumes-from работает
# даже с остановленным контейнером), поэтому берём его заранее.
API_CID="$("${COMPOSE[@]}" ps -aq api || true)"
[[ -n "$API_CID" || -z "$UPLOADS_ARCHIVE" ]] || die "контейнер api не создан — сначала up -d"

log "поднимаю db"
"${COMPOSE[@]}" up -d db
# Ждём healthcheck: сразу после старта Postgres ещё не принимает соединения.
for _ in $(seq 1 30); do
  "${COMPOSE[@]}" exec -T db pg_isready -q && break
  sleep 2
done
"${COMPOSE[@]}" exec -T db pg_isready -q || die "Postgres не отвечает"

# --- Страховочная копия ------------------------------------------------------
if $SAFETY; then
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date +%F-%H%M)"
  log "страховочная копия текущего состояния…"
  # shellcheck disable=SC2016  # переменные раскрывает shell контейнера, не наш
  "${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    | gzip > "$BACKUP_DIR/pre-restore-db-$STAMP.sql.gz"
  gzip -t "$BACKUP_DIR/pre-restore-db-$STAMP.sql.gz" || die "страховочный дамп повреждён"
  if [[ -n "$API_CID" ]]; then
    docker run --rm --volumes-from "$API_CID" alpine \
      tar czf - -C /app/uploads . > "$BACKUP_DIR/pre-restore-uploads-$STAMP.tar.gz"
    gzip -t "$BACKUP_DIR/pre-restore-uploads-$STAMP.tar.gz" || die "страховочный архив повреждён"
  fi
  log "страховочная копия: $BACKUP_DIR/pre-restore-*-$STAMP.*"
fi

# --- Останавливаем писателей -------------------------------------------------
# api пишет в оба хранилища (планировщик тикает сам по себе, без запросов),
# website держит ISR-кеш страниц каталога — его тоже гасим, чтобы после
# восстановления он не отдавал старые страницы.
log "останавливаю website и api"
"${COMPOSE[@]}" stop website api

# --- База --------------------------------------------------------------------
if [[ -n "$DB_ARCHIVE" ]]; then
  log "пересоздаю базу и наливаю дамп…"
  # shellcheck disable=SC2016  # весь скрипт ниже исполняет shell контейнера
  # DROP DATABASE откажет, пока есть хоть одно соединение, — рвём чужие сами.
  # Всё выполняется из служебной базы `postgres`, иначе psql рубил бы сук под собой.
  "${COMPOSE[@]}" exec -T db sh -c '
    set -e
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '"'"'$POSTGRES_DB'"'"' AND pid <> pg_backend_pid()" >/dev/null
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\""
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""
  '
  # shellcheck disable=SC2016
  gunzip -c "$DB_ARCHIVE" | "${COMPOSE[@]}" exec -T db sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q' >/dev/null
  log "база восстановлена"
fi

# --- Фотографии --------------------------------------------------------------
if [[ -n "$UPLOADS_ARCHIVE" ]]; then
  log "заменяю содержимое тома uploads…"
  # Владельца каталога снимаем с него самого и возвращаем распакованным файлам:
  # tar из-под root создал бы root-овые файлы, и api (непривилегированный
  # apiusr из Dockerfile) не смог бы удалить фотографию товара.
  gunzip -c "$UPLOADS_ARCHIVE" | docker run --rm -i --volumes-from "$API_CID" alpine sh -c '
    set -e
    owner=$(stat -c "%u:%g" /app/uploads)
    find /app/uploads -mindepth 1 -delete
    tar xf - -C /app/uploads
    chown -R "$owner" /app/uploads
  '
  log "фотографии восстановлены"
fi

# --- Поднимаем обратно -------------------------------------------------------
log "поднимаю api и website"
"${COMPOSE[@]}" up -d api website

log "готово. Проверьте:"
log "  ${COMPOSE[*]} ps"
log "  curl -sf https://<домен>/api/proxy/health"
