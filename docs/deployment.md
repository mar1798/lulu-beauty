# Деплой Lulu Beauty

Разворачивание всего стека на одном сервере: Caddy (TLS) → `website` (Next) →
`api` (FastAPI) → `db` (Postgres 16). Всё поднимается одной командой
`docker compose`, наружу смотрит только Caddy.

Такой вариант выбран для MVP осознанно: у API есть постоянный планировщик
(`app/scheduler.py` — напоминания, закрытие сборов, чистка сессий) и локальный
диск под фотографии товаров (`LocalDiskStorage`), поэтому serverless и
scale-to-zero не подходят, а горизонтального масштабирования пока не требуется.

---

## Что уже сделано (в репозитории)

| Файл | Назначение |
| --- | --- |
| `apps/api/Dockerfile` | Образ бэкенда. Контекст сборки — сам `apps/api`. На старте делает `alembic upgrade head` |
| `apps/api/.dockerignore` | Для контекста бэкенда: `.venv`, кеши, локальный `uploads/` |
| `apps/website/Dockerfile` | Образ фронтенда. Контекст сборки — **корень репозитория** (Next компилирует `widgets` из исходников) |
| `.dockerignore` | Для контекста фронтенда, т.е. всего репозитория: не пускает в образ `.git`, `node_modules`, `.env*` |
| `docker-compose.prod.yml` | Прод-стек из четырёх сервисов: `db`, `api`, `website`, `caddy` |
| `deploy/Caddyfile` | Маршруты и автоматический TLS |
| `deploy/.env.prod.example` | Шаблон всех прод-переменных (копируется в `.env.prod` в корне) |
| `deploy/backup.sh` | Бэкап базы и фотографий, проверка архивов, ротация, выгрузка через `rclone` |
| `deploy/restore.sh` | Восстановление из этих архивов, со страховочной копией текущего состояния |
| `apps/website/next.config.js` | `output: 'standalone'`, заголовки безопасности, рерайт `/files/*` — трогать не нужно |
| `.gitignore` | Содержит `.env.prod` — секреты в git не попадут |

Корневой `docker-compose.yml` (без суффикса) — **девелоперский**: поднимает
только `db` и `api` для локальной разработки. В проде он не используется,
поэтому все команды ниже идут с явным `-f docker-compose.prod.yml`.

Проверено локально: образ фронтенда собирается, контейнер поднимается и отдаёт
`200` на `/`, `/login`, `/catalog` даже при недоступном API (страницы каталога
наполнятся через ISR при первом обращении).

**Ничего из кода менять для деплоя не требуется.** Всё ниже — действия с вашей
стороны: сервер, домен, бот, секреты.

---

## Шаг 1. Сервер

Нужен VPS с Docker: 2 vCPU / 4 ГБ RAM / 40 ГБ диска с запасом хватает
(Hetzner CX22 ≈ €4.5/мес, любой аналог подойдёт). ОС — Ubuntu 24.04 LTS.

На чистом сервере:

```bash
# от root
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh          # docker + docker compose plugin
adduser deploy && usermod -aG docker deploy     # не работать под root
```

Дальше — под пользователем `deploy`.

**Файрвол.** Наружу нужны только SSH, `80` и `443` — последний и по TCP, и по
UDP (отсюда четыре правила на три порта). Всё остальное закрыть:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp     # HTTP/3; без него Caddy молча откатится на TCP
ufw enable
```

Порт `5432` в правилах не появляется намеренно: в `docker-compose.prod.yml`
сервис `db` вообще не публикует портов, база доступна только изнутри сети
compose (в отличие от девелоперского `docker-compose.yml`, который вешает её на
хост). Поэтому и туннель `ssh -L 5432:localhost:5432` подключаться будет не к
чему — работать с базой на сервере так:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

(имя пользователя и базы берутся из окружения самого контейнера — так команда
не разъедется с `POSTGRES_USER`/`POSTGRES_DB` в `.env.prod`)

---

## Шаг 2. Домен

1. Купить домен (или взять существующий).
2. Сделать `A`-запись на IP сервера (и `AAAA`, если есть IPv6).
3. **Дождаться, пока запись разойдётся** (`dig +short ваш-домен` должен вернуть
   IP сервера).

Это обязательно сделать **до** первого запуска: Caddy выпускает сертификат
Let's Encrypt сразу при старте и без работающего DNS получит отказ. Несколько
неудачных попыток подряд упираются в недельные лимиты Let's Encrypt.

---

## Шаг 3. Telegram-бот

В [@BotFather](https://t.me/BotFather):

1. `/newbot` — получить **токен** и **username** бота.
2. `/setdomain` — выбрать бота, указать `https://ваш-домен`.
   Без этого кнопка «Log in with Telegram» на `/login` нарисуется и откажет
   авторизовать; тогда в `.env.prod` нужно поставить
   `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET=false`.
3. Опционально: `/setmenubutton`, описание, аватар.

Вебхук регистрировать руками не нужно — бэкенд делает это сам на старте, если в
`.env.prod` заполнены все три переменные `TELEGRAM_USE_WEBHOOK` /
`TELEGRAM_WEBHOOK_URL` / `TELEGRAM_WEBHOOK_SECRET`.

---

## Шаг 4. Код на сервере

```bash
git clone <адрес репозитория> lulu-beauty
cd lulu-beauty
```

---

## Шаг 5. Переменные окружения

```bash
cp deploy/.env.prod.example .env.prod
```

Сгенерировать четыре значения (каждое — своей командой, не копировать одно и то же):

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 16   # POSTGRES_PASSWORD
```

Заполнить в `.env.prod`:

| Переменная | Значение |
| --- | --- |
| `SITE_DOMAIN` | `ваш-домен` (без `https://`) |
| `ACME_EMAIL` | ваша почта — на неё Let's Encrypt шлёт предупреждения |
| `POSTGRES_PASSWORD` | сгенерированный пароль |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | сгенерированные секреты |
| `CORS_ORIGIN`, `WEBSITE_BASE_URL`, `TELEGRAM_WEBHOOK_URL` | `https://ваш-домен` |
| `PUBLIC_FILES_BASE_URL` | `https://ваш-домен/files` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | из BotFather (username без `@`) |
| `TELEGRAM_WEBHOOK_SECRET` | сгенерированный секрет |
| `OWNER_PHONE`, `OWNER_NAME` | телефон и имя владельца магазина |

Остальное в шаблоне уже заполнено разумными значениями, но проверьте под свой
магазин: `CYCLE_TIMEZONE` (`Asia/Bishkek` — по ней считаются дедлайны сборов),
`CURRENCY` (`KGS`) и `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET` (выключить, если домен
боту ещё не прописан через `/setdomain`).

⚠️ **`PUBLIC_FILES_BASE_URL` обязан быть ровно `https://<SITE_DOMAIN>/files`.**
Это не косметика: `apps/website/src/components/Image.tsx` отрезает от
сохранённого в базе адреса фотографии именно этот префикс, чтобы картинка стала
относительной (`/files/...`) и прошла через рерайт Next. Разойдутся адреса —
фотографии товаров перестанут отображаться.

Файл `.env.prod` содержит секреты, он в `.gitignore` — **не коммитить**.

---

## Шаг 6. Первый запуск

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Первая сборка занимает несколько минут. Дальше:

```bash
# все четыре сервиса должны быть Up (db, api и website — ещё и healthy;
# у caddy healthcheck нет)
docker compose --env-file .env.prod -f docker-compose.prod.yml ps

# логи, если что-то не поднялось
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f caddy
```

---

## Шаг 7. Аккаунт владельца

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec api python -m app.scripts.seed
```

Скрипт создаёт запись ADMIN по номеру из `OWNER_PHONE`. Пароля нет — вход в
проект только через Telegram, поэтому дальше владелец должен **с того самого
номера** открыть бота и поделиться контактом: только тогда Telegram-аккаунт
привяжется к созданной админской записи.

Если поделиться контактом с другого номера, получится обычный покупатель без
доступа в `/admin`.

---

## Шаг 8. Проверка

- [ ] `https://ваш-домен` открывается, замок в адресной строке зелёный
- [ ] `/catalog` открывается (пустой каталог — нормально, товаров ещё нет)
- [ ] `/login` → вход через Telegram доходит до конца, бот присылает подтверждение
- [ ] владелец попадает в `/admin` (покупателя оттуда редиректит на `/catalog` — так и задумано)
- [ ] в админке добавляется товар **с фотографией**, и фотография видна в каталоге
      (это проверяет связку `PUBLIC_FILES_BASE_URL` ↔ `NEXT_PUBLIC_API_BASE_URL`)
- [ ] открывается сбор, товар кладётся в корзину, заявка оформляется, бот шлёт уведомление
- [ ] выгрузка заказа в xlsx скачивается
- [ ] `./deploy/backup.sh` отрабатывает и кладёт два непустых архива (Шаг 9)

---

## Шаг 9. Бэкапы

Состояние живёт в двух местах: том `pgdata` (база) и том `uploads` (фотографии
товаров). Потеря второго — это строки `product_images` в базе, указывающие в
пустоту. Том `caddy_data` (сертификаты) в бэкап намеренно не входит: Caddy
выпустит их заново — но именно поэтому не стоит пересоздавать этот том без
нужды, недельные лимиты Let's Encrypt считаются по домену.

Скрипт `deploy/backup.sh` снимает оба, проверяет архивы на целостность,
опционально выгружает их наружу через `rclone` и удаляет старые:

```bash
./deploy/backup.sh
```

Из зависимостей нужны только `docker` и `flock` (есть в Ubuntu из коробки);
`rclone` — опционально, для выгрузки наружу.

Раз в сутки по cron (от пользователя `deploy`, `crontab -e`):

```
17 3 * * * /home/deploy/lulu-beauty/deploy/backup.sh >> /home/deploy/backup.log 2>&1
```

Настраивается переменными окружения:

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `BACKUP_DIR` | `$HOME/lulu-backups` | куда складывать архивы |
| `KEEP_DAYS` | `14` | сколько дней хранить (локально и на remote) |
| `BACKUP_REMOTE` | пусто | rclone-remote для выгрузки, напр. `r2:lulu-backups` |
| `ENV_FILE` | `<корень>/.env.prod` | откуда compose берёт переменные |

⚠️ **Пока `BACKUP_REMOTE` не задан, копии лежат на том же сервере** — от его
потери это не спасает, и скрипт предупреждает об этом при каждом запуске.
Внешнее хранилище настраивается один раз:

```bash
sudo -v ; curl https://rclone.org/install.sh | sudo bash
rclone config           # добавить remote (Cloudflare R2 / S3 / любой другой)
BACKUP_REMOTE=r2:lulu-backups ./deploy/backup.sh
```

Задав `BACKUP_REMOTE` в cron-строке (`17 3 * * * BACKUP_REMOTE=r2:lulu-backups /home/…`),
выгрузку получаешь на каждом запуске.

**Восстановление** — `deploy/restore.sh`, тем же набором архивов:

```bash
./deploy/restore.sh ~/lulu-backups/db-2026-08-18-0317.sql.gz \
                    ~/lulu-backups/uploads-2026-08-18-0317.tar.gz
```

Можно передать только один архив — база и фотографии восстанавливаются
независимо. Скрипт проверяет архивы, спрашивает подтверждение, снимает
страховочную копию текущего состояния (`pre-restore-*`), гасит `website` и `api`
на время замены, пересоздаёт базу и наливает дамп, заменяет содержимое тома
`uploads` и поднимает сервисы обратно. `--yes` пропускает вопрос,
`--no-safety` — страховочную копию.

⚠️ Операция разрушающая: текущие данные заменяются целиком. База именно
пересоздаётся (DROP/CREATE), а не наливается поверх: дамп `pg_dump` не содержит
DROP-ов, и налив в непустую базу упал бы на конфликтах ключей, оставив половину
старых строк и половину новых.

**Проверьте восстановление хотя бы раз.** Бэкап, который никогда не
разворачивали, — это не бэкап, а надежда.

---

## Повседневные операции

**Обновление кода:**

```bash
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Миграции применятся сами при старте контейнера `api`.

**Изменение публичных переменных фронтенда** (`NEXT_PUBLIC_*` — домен, username
бота, флаг виджета входа): их Next вшивает в бандл **на этапе сборки**, поэтому
перезапуска мало — нужна пересборка:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build website
```

**Остановка и снос:**

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml stop      # погасить
docker compose --env-file .env.prod -f docker-compose.prod.yml down      # снести контейнеры
```

⚠️ `down -v` дополнительно удаляет тома — это разом база, фотографии и
сертификаты. Флаг здесь не нужен никогда.

**Логи и статус:**

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api
curl https://ваш-домен/api/proxy/health   # /health открыт через прокси Next
tail -n 50 ~/backup.log                   # последний ночной бэкап
```

`/health` делает настоящий `SELECT 1` — `200` означает, что и API, и база живы.

---

## Что осталось за рамками MVP

- **Фотографии в объектном хранилище.** Сейчас `STORAGE_DRIVER=local`, файлы на
  диске сервера, и из-за этого контейнер `api` должен быть ровно один. Переезд
  на S3-совместимое хранилище (Cloudflare R2 — бесплатный исходящий трафик)
  снимет и это ограничение, и половину работы `deploy/backup.sh` (архив
  `uploads` стал бы не нужен).
- **Мониторинг.** Внешняя проверка `/health` (Uptime Kuma, healthchecks.io) —
  чтобы о падении узнать не от покупателя. Туда же просится пинг об успешном
  бэкапе: сейчас о том, что ночной `backup.sh` упал, узнаёшь только из
  `backup.log`.
- **Staging-окружение.** Тот же compose на втором домене/сервере.
- **CI-деплой.** Сейчас деплой ручной (`git pull` + `up -d --build`).
  GitHub Actions уже гоняет проверки (`node.js.yml`, `api.yml`), но не выкатывает.
- **Промотирование CSP.** В `apps/website/next.config.js` полная политика пока в режиме
  `Report-Only` — после запуска стоит собрать отчёты о нарушениях и включить её
  принудительно.
