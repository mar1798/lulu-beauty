#!/usr/bin/env bash
#
# Выкатка релиза на прод. Запускается **на сервере**, от пользователя `deploy`.
#
#   ./deploy/release.sh              # последний тег vГГГГ.ММ.ДД из origin
#   ./deploy/release.sh v2026.09.14  # конкретный тег (им же откатываются назад)
#
# Почему тег, а не `git pull`: ветка отвечает на вопрос «что там сейчас», а
# выкатывать нужно то, у чего есть имя. После `checkout` репозиторий на сервере
# остаётся в detached HEAD — это не авария, а страховка: закоммитить на проде
# физически не получится.
#
# Флаги:
#
#   --yes        не спрашивать подтверждения (для неинтерактивного запуска)
#   --no-backup  пропустить бэкап перед выкаткой
#   --no-wait    не ждать healthy и не проверять /health (только собрать и поднять)
#
# Настройки — переменными окружения (значения по умолчанию в скобках):
#
#   ENV_FILE      путь к .env.prod            (<корень репозитория>/.env.prod)
#   RELEASE_LOG   журнал выкаток              ($HOME/releases.log)
#   WAIT_SECONDS  сколько ждать healthy       (240)
#
# ⚠️ Откат кода **не откатывает схему базы**: контейнер `api` накатывает
# `alembic upgrade head` на каждом старте, а назад миграции сами не уходят.
# Поэтому в релизе допустима только расширяющая миграция (добавить колонку
# nullable, таблицу, индекс); удаление и NOT NULL — следующим релизом, когда
# предыдущий уже пожил в проде. См. «Релизы» в docs/deployment.md.

set -Eeuo pipefail

# Корень репозитория — на два уровня выше самого скрипта, поэтому запускать его
# можно из любой директории.
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"
RELEASE_LOG="${RELEASE_LOG:-$HOME/releases.log}"
WAIT_SECONDS="${WAIT_SECONDS:-240}"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.prod.yml")

ASSUME_YES=0
DO_BACKUP=1
DO_WAIT=1
TARGET=""

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ОШИБКА: $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --no-wait) DO_WAIT=0 ;;
    -*) die "неизвестный флаг: $1" ;;
    *) [[ -z "$TARGET" ]] || die "лишний аргумент: $1"; TARGET="$1" ;;
  esac
  shift
done

[[ -f "$ENV_FILE" ]] || die "не найден $ENV_FILE"
command -v docker >/dev/null || die "docker не установлен"
command -v git >/dev/null || die "git не установлен"

cd "$REPO_ROOT"

# Незакоммиченные правки на проде — всегда чья-то забытая отладка. Снести их
# `checkout`ом молча нельзя: возможно, это единственная копия.
[[ -z "$(git status --porcelain)" ]] ||
  die "рабочее дерево не чистое — разберитесь с правками на сервере до выкатки"

log "git fetch…"
git fetch --tags --prune --quiet origin

if [[ -z "$TARGET" ]]; then
  # Сортировка по версии, а не лексикографическая: v2026.10.01 должен быть
  # старше v2026.9.30, как бы ни выглядели строки.
  TARGET="$(git tag -l 'v*' --sort=-v:refname | head -n1)"
  [[ -n "$TARGET" ]] || die "в репозитории нет тегов vГГГГ.ММ.ДД — укажите ref явно"
fi

git rev-parse --verify --quiet "$TARGET^{commit}" >/dev/null ||
  die "не найден ref: $TARGET (тег появился в origin?)"

TARGET_SHA="$(git rev-parse --short "$TARGET^{commit}")"
CURRENT_SHA="$(git rev-parse --short HEAD)"
# Чем сейчас представлен прод: тег, если он есть, иначе просто хеш.
CURRENT_NAME="$(git describe --tags --always HEAD 2>/dev/null || echo "$CURRENT_SHA")"

log "сейчас:  $CURRENT_NAME ($CURRENT_SHA)"
log "выкатим: $TARGET ($TARGET_SHA)"

if [[ "$CURRENT_SHA" == "$TARGET_SHA" ]]; then
  log "это тот же коммит — пересобираем на месте"
else
  echo
  # Направление диапазона намеренно двустороннее: при откате назад
  # `CURRENT..TARGET` пуст, и человек не увидел бы ничего.
  git log --oneline --left-right "$CURRENT_SHA...$TARGET_SHA" | sed 's/^/  /'
  echo

  # Миграции — единственное, что не откатывается вместе с кодом, поэтому о них
  # предупреждаем отдельно и заранее, а не постфактум в логе контейнера.
  if git diff --name-only "$CURRENT_SHA" "$TARGET_SHA" -- apps/api/migrations/versions |
    grep -q .; then
    log "ВНИМАНИЕ: в релизе есть миграции — схема изменится и обратно сама не вернётся"
  fi
fi

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "Выкатывать? [y/N] " answer
  [[ "$answer" == [yY] ]] || { log "отменено"; exit 0; }
fi

if [[ $DO_BACKUP -eq 1 ]]; then
  log "бэкап перед выкаткой…"
  # Бэкап не должен ронять релиз молча, но и игнорировать его отказ нельзя:
  # чаще всего это значит, что база уже недоступна.
  "$REPO_ROOT/deploy/backup.sh" || die "бэкап не прошёл — выкатку не начинаю"
fi

log "checkout $TARGET"
git checkout --detach --quiet "$TARGET"

log "сборка и запуск…"
"${COMPOSE[@]}" up -d --build

# --- Проверка ----------------------------------------------------------------
# Откат печатается заранее: тот, кто читает этот вывод в три часа ночи, не
# должен вспоминать, что стояло до релиза.
rollback_hint() {
  log "откат: ./deploy/release.sh $CURRENT_NAME --no-backup"
  [[ "$CURRENT_SHA" == "$TARGET_SHA" ]] ||
    log "      (миграции, если они были в этом релизе, откатятся не сами)"
}

if [[ $DO_WAIT -eq 0 ]]; then
  log "проверка пропущена (--no-wait); выкачено: $TARGET ($TARGET_SHA)"
  exit 0
fi

# Ждём healthcheck'и compose, а не просто «контейнер запустился»: у `api` в
# healthcheck настоящий SELECT 1, у `website` — запрос к корню. У `caddy`
# healthcheck'а нет, его проверит внешний запрос ниже.
log "жду healthy (до ${WAIT_SECONDS}с)…"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
while :; do
  unhealthy=""
  for service in db api website; do
    cid="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
    if [[ -z "$cid" ]]; then
      unhealthy="$unhealthy $service(нет контейнера)"
      continue
    fi
    state="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)"
    [[ "$state" == "healthy" ]] || unhealthy="$unhealthy $service($state)"
  done

  [[ -n "$unhealthy" ]] || break

  if [[ $(date +%s) -ge $deadline ]]; then
    log "не дождался:$unhealthy"
    log "логи: docker compose --env-file $ENV_FILE -f docker-compose.prod.yml logs --tail=50 api website"
    rollback_hint
    exit 1
  fi

  sleep 5
done
log "контейнеры healthy"

# Внешняя проверка: та же цепочка, по которой ходит покупатель (Caddy → Next →
# API → база), и тот же адрес, что дёргает deploy/health-watch.sh.
SITE_DOMAIN="${SITE_DOMAIN:-$(sed -n 's/^SITE_DOMAIN=//p' "$ENV_FILE" | tail -n1)}"
if [[ -z "$SITE_DOMAIN" ]]; then
  log "предупреждение: в $ENV_FILE нет SITE_DOMAIN — внешняя проверка пропущена"
else
  HEALTH_URL="https://$SITE_DOMAIN/api/proxy/health"
  log "проверяю $HEALTH_URL"

  ok=0
  for attempt in 1 2 3; do
    body="$(curl -sS -m 15 "$HEALTH_URL" 2>&1)" || body="сеть: $body"
    if printf '%s' "$body" | grep -q '"database":{"status":"up"}'; then
      ok=1
      break
    fi
    [[ $attempt -eq 3 ]] || sleep 5
  done

  if [[ $ok -eq 0 ]]; then
    log "ответ не тот, что ожидали: $(printf '%s' "$body" | tr '\n' ' ')"
    rollback_hint
    exit 1
  fi
fi

# Журнал выкаток. Единственный ответ на вопрос «что и когда мы выкатили»:
# ни тегов в образах, ни реестра здесь нет.
printf '%s  %s  %s  (было %s)\n' "$(date '+%F %T')" "$TARGET" "$TARGET_SHA" "$CURRENT_NAME" \
  >> "$RELEASE_LOG"

log "готово: $TARGET ($TARGET_SHA), записано в $RELEASE_LOG"
