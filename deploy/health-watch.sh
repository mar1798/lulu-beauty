#!/usr/bin/env bash
#
# Внешняя проверка живости сайта: дёргает публичную ручку /health и отчитывается
# в healthchecks.io. Дополняет UptimeRobot, который на бесплатном тарифе умеет
# только HEAD и потому видит лишь статические страницы — а они отдаются и с
# мёртвой базой.
#
# Запуск по cron (каждые 5 минут):
#
#   */5 * * * * HEALTH_PING_URL=https://hc-ping.com/<uuid> /home/deploy/lulu-beauty/deploy/health-watch.sh
#
# Настройки — переменными окружения (значения по умолчанию в скобках):
#
#   HEALTH_PING_URL  адрес проверки в healthchecks.io  (пусто — только код возврата)
#   HEALTH_URL       что дёргать        (https://<SITE_DOMAIN>/api/proxy/health)
#   ENV_FILE         откуда брать домен (<корень репозитория>/.env.prod)
#   LOG_FILE         куда писать падения               ($HOME/health-watch.log)
#
# Молчание в логе означает, что всё в порядке: успехи не пишутся, иначе за сутки
# накопится 288 строк ни о чём. Пишутся только падения.
#
# Смерть самого сервера эта схема тоже ловит — но не сама: пинг просто перестаёт
# приходить, и тревогу поднимает healthchecks по расписанию проверки.

set -uo pipefail

# Корень репозитория — на два уровня выше самого скрипта, поэтому запускать его
# можно из любой директории (в том числе из cron, где $PWD — домашняя папка).
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"

# Домен берётся из той же переменной, по которой Caddy выпускает сертификат, —
# иначе однажды проверялся бы один адрес, а работал другой.
SITE_DOMAIN="${SITE_DOMAIN:-$(sed -n 's/^SITE_DOMAIN=//p' "$ENV_FILE" 2>/dev/null | tail -n1)}"

HEALTH_URL="${HEALTH_URL:-https://$SITE_DOMAIN/api/proxy/health}"
HEALTH_PING_URL="${HEALTH_PING_URL:-}"
LOG_FILE="${LOG_FILE:-$HOME/health-watch.log}"

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE"; }

# Без домена проверять нечего, а молча пинговать «всё хорошо» — худшее, что может
# сделать монитор: тишина в healthchecks означала бы, что сайт жив.
if [[ -z "$SITE_DOMAIN" ]]; then
  log "ОШИБКА: не удалось определить SITE_DOMAIN (нет $ENV_FILE?), проверка не выполнена"
  exit 2
fi

# Одна проверка: код ответа и тело. Успехом считается 200 с базой в состоянии up —
# ручка отдаёт 503, когда Postgres недоступен, но полагаться только на код мало:
# 200 с чужим или пустым телом означал бы, что отвечает не то, что мы думаем.
probe() {
  local body code
  # Текст ошибки curl (недостижимый хост, таймаут, TLS) обязан дойти до письма:
  # «ПАДЕНИЕ» без причины ничем не помогает тому, кого оно разбудило.
  body="$(curl -sS -m 15 -w '\n%{http_code}' "$HEALTH_URL" 2>&1)" || {
    printf 'сеть: %s' "$(printf '%s' "$body" | tr '\n' ' ')"
    return 1
  }
  code="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"

  [[ "$code" == "200" ]] || { printf '%s' "код $code: $body"; return 1; }
  printf '%s' "$body" | grep -q '"status":"ok"' || { printf '%s' "тело без status=ok: $body"; return 1; }
  printf '%s' "$body" | grep -q '"database":{"status":"up"}' || { printf '%s' "база не up: $body"; return 1; }
  return 0
}

# Вторая попытка через 10 секунд: разовая сетевая икота не должна будить человека.
if ! DETAIL="$(probe)"; then
  sleep 10
  DETAIL="$(probe)" && FAILED=0 || FAILED=1
else
  FAILED=0
fi

if [[ -n "$HEALTH_PING_URL" ]]; then
  if [[ $FAILED -eq 0 ]]; then
    curl -fsS -m 10 --retry 2 -o /dev/null "$HEALTH_PING_URL" || log "предупреждение: пинг успеха не ушёл"
  else
    curl -fsS -m 10 --retry 2 -o /dev/null --data-raw "$DETAIL" "$HEALTH_PING_URL/fail" ||
      log "предупреждение: пинг падения не ушёл"
  fi
fi

if [[ $FAILED -eq 1 ]]; then
  log "ПАДЕНИЕ: $DETAIL"
  # Лог не должен расти бесконечно, даже если сайт лежит неделю.
  [[ $(stat -c%s "$LOG_FILE") -gt 1048576 ]] && tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  exit 1
fi

exit 0
