# syntax=docker/dockerfile:1

# Собирается с **корнем монорепозитория** как контекстом (в отличие от
# apps/api/Dockerfile, которому хватает своей директории):
#
#   docker build -f apps/website/Dockerfile .
#
# Иначе никак — `website` зависит от `widgets` по workspace-ссылке и
# компилирует его из исходников (`transpilePackages`), а `npm ci` требует
# корневой `package-lock.json`.

# --- Зависимости -------------------------------------------------------------
# Отдельный слой ради кэша: пока не менялись package.json/lock, `npm ci`
# не переустанавливается при каждой правке кода.
FROM node:22.23.1-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/website/package.json apps/website/
COPY packages/widgets/package.json packages/widgets/
RUN --mount=type=cache,target=/root/.npm npm ci

# --- Сборка ------------------------------------------------------------------
FROM node:22.23.1-slim AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .

# `NEXT_PUBLIC_*` Next подставляет в клиентский бандл **на этапе сборки**, а не
# читает при запуске, поэтому они и приходят аргументами сборки, а не через
# `environment:` в compose. Поменять их = пересобрать образ.
#
# NEXT_PUBLIC_API_BASE_URL обязан совпадать с началом PUBLIC_FILES_BASE_URL у
# API: `src/components/Image.tsx` отрезает ровно этот префикс, чтобы превратить
# сохранённый в БД абсолютный адрес фотографии в относительный `/files/*`.
ARG NEXT_PUBLIC_API_BASE_URL
# Адрес сайта для превью ссылки (`og:image`, `og:url`) — относительных путей
# скрапер не понимает. В проде совпадает с NEXT_PUBLIC_API_BASE_URL, но живёт
# отдельно: это разные вещи, которые однажды разъедутся.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ARG NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET=false
# Не `NEXT_PUBLIC_`, но тоже аргумент сборки: `rewrites()` из next.config.js
# вычисляется во время `next build` и запекается в `.next/routes-manifest.json`.
# Standalone-сервер читает готовый манифест и next.config.js больше не
# исполняет, поэтому `API_BASE_URL` из `environment:` на адрес рерайта
# `/files/*` уже не влияет — без этого аргумента образ навсегда проксирует
# фотографии на `http://localhost:3001` внутри своего же контейнера (пусто →
# 500 на `/files/*` и 400 от `/_next/image`). Значение обязано совпадать с
# рантаймовым `API_BASE_URL` в compose.
ARG API_BASE_URL=http://localhost:3001
ENV API_BASE_URL=$API_BASE_URL \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME \
    NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET=$NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# API на этапе сборки не нужен: `getStaticProps` каталога и главной ловят
# ошибку запроса и отдают пустые пропсы, а `getStaticPaths` товара — `fallback:
# true`. Страницы наполнятся при первом запросе через ISR (`revalidate`).
RUN npm run build -w website

# --- Запуск ------------------------------------------------------------------
# `output: 'standalone'` (см. next.config.js) кладёт в .next/standalone сервер
# вместе с трассированными зависимостями — dev-зависимости и исходники
# монорепозитория в рантайм-образ не едут.
FROM node:22.23.1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Чем собрали — прямо на образе. Аргументы выше запеклись в бандл и после
# сборки не читаются ниоткуда: в контейнере их нет (это не `environment:`), а в
# `.next` они лежат кусками минифицированного JS. Значит, единственный способ
# узнать, на какой домен смотрит готовый образ, — спросить его самого.
#
# Спрашивает deploy/release.sh перед стартом: значения приходят из repository
# variables на GitHub, а домен для сертификата — из .env.prod на сервере, и
# разъехаться эти два места могут молча. Метка превращает «клиент стучится не
# туда» в отказ задеплоить.
#
# ARG'и объявлены заново: они видны только той стадии, где объявлены.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ARG NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET=false
LABEL sululu.build.site-url="$NEXT_PUBLIC_SITE_URL" \
      sululu.build.telegram-bot-username="$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME" \
      sululu.build.telegram-login-widget="$NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET"

# `outputFileTracingRoot` — корень монорепозитория, поэтому внутри standalone
# сохраняется структура репозитория: сервер лежит в apps/website/server.js.
COPY --from=builder --chown=node:node /repo/apps/website/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/website/.next/static ./apps/website/.next/static
COPY --from=builder --chown=node:node /repo/apps/website/public ./apps/website/public

# Кэш ISR: standalone его не содержит (на момент сборки страниц ещё нет), а
# создать директорию в рантайме процесс уже не сможет — корень принадлежит root.
RUN mkdir -p /app/apps/website/.next/cache && chown -R node:node /app/apps/website/.next

USER node
EXPOSE 3000
CMD ["node", "apps/website/server.js"]
