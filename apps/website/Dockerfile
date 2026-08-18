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
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ARG NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET=false
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
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
