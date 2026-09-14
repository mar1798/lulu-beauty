import Head from 'next/head'
import React from 'react'
import { publicConfig } from '@/сonfig'

/**
 * Превью ссылки: `og:*` и то, что к ним прилагается.
 *
 * Разделено на две части намеренно. `SiteMeta` — постоянная, её рисует `_app`
 * один раз на все страницы, включая приватные (корзину, вход, аккаунт): те
 * своего описания не заслуживают, но и голой ссылкой в мессенджере выглядеть
 * не должны. `PageMeta` — сменная, её ставит публичная страница поверх.
 *
 * Перекрытие держится на `key`: `next/head` схлопывает одноимённые теги,
 * оставляя **последний** — а Head страницы рисуется после Head из `_app`.
 * Без `key` дедупликации не будет вовсе: по атрибуту `property` она не
 * работает, только по `name`/`http-equiv`/`charSet` и явному ключу.
 */

export const SITE_NAME = 'Sululu'

export const SITE_TITLE = 'Sululu — самые низкие цены на косметику и уход'

export const SITE_DESCRIPTION =
  'Косметика и уход по самым низким ценам: берём напрямую и общим заказом. Соберите заявку до закрытия сбора — владелец подтвердит её в Telegram.'

/**
 * Витрина сайта для превью: та же сцена, что на главной, с подписью марки.
 * Лежит в `public`; размеры нигде не объявляются — страница товара подменяет
 * картинку своей, а её размеров API не отдаёт, и одно объявление на две разные
 * картинки соврало бы. Скрапер измеряет файл сам.
 */
const SITE_IMAGE = {
  path: '/og-image.png',
  alt: 'Sululu — косметика и уход по самым низким ценам',
} as const

/** Адрес сайта, каким его увидит скрапер: `og:*` относительных путей не понимает. */
function absoluteUrl(path: string): string {
  return `${publicConfig('siteUrl')}${path}`
}

/** Постоянная часть превью. Только для `_app`. */
export const SiteMeta: React.FC = () => (
  <Head>
    <meta key="og:site_name" property="og:site_name" content={SITE_NAME} />
    <meta key="og:type" property="og:type" content="website" />
    <meta key="og:locale" property="og:locale" content="ru_RU" />
    <meta key="og:title" property="og:title" content={SITE_TITLE} />
    <meta key="og:description" property="og:description" content={SITE_DESCRIPTION} />
    <meta key="og:image" property="og:image" content={absoluteUrl(SITE_IMAGE.path)} />
    <meta key="og:image:alt" property="og:image:alt" content={SITE_IMAGE.alt} />
    {/* Карточка во всю ширину — иначе X покажет картинку квадратной миниатюрой сбоку. */}
    <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
  </Head>
)

interface IPageMetaProps {
  /** Заголовок вкладки, он же заголовок превью. */
  title: string
  /** Без него страница наследует описание сайта — это лучше пустого превью. */
  description?: string
  /** Путь страницы со слэша (`/catalog`); отсюда собирается абсолютный `og:url`. */
  path: string
  /** Абсолютный адрес своей картинки — фотография товара вместо общей витрины. */
  image?: { url: string; alt: string }
}

/** Сменная часть превью. Для публичных страниц — приватным хватает `SiteMeta`. */
export const PageMeta: React.FC<IPageMetaProps> = ({ title, description, path, image }) => (
  <Head>
    <title>{title}</title>
    <meta key="og:title" property="og:title" content={title} />
    <meta key="og:url" property="og:url" content={absoluteUrl(path)} />

    {description !== undefined && (
      <>
        <meta name="description" content={description} />
        <meta key="og:description" property="og:description" content={description} />
      </>
    )}

    {image !== undefined && (
      <>
        <meta key="og:image" property="og:image" content={image.url} />
        <meta key="og:image:alt" property="og:image:alt" content={image.alt} />
      </>
    )}
  </Head>
)
