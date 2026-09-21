import type { IFaqItem, IProduct } from 'widgets/types'
import { formatVolume } from 'widgets/utils'
import { INSTAGRAM_URL } from '@/utils/contacts'
import {
  absoluteUrl,
  productDescription,
  productFullName,
  SITE_DESCRIPTION,
  SITE_NAME,
} from '@/utils/seo'
import { publicConfig } from '@/сonfig'

/**
 * Микроразметка `schema.org` — то же, что уже написано на странице, но в
 * виде, который поисковик читает без догадок: цена, наличие, марка, ветка
 * хлебных крошек, вопросы и ответы.
 *
 * Правило здесь одно и жёсткое: **в разметку попадает только то, что
 * посетитель видит на той же странице**. Разметка, обещающая больше страницы,
 * — прямой путь к ручным санкциям, а не к расширенному сниппету. Поэтому тут
 * нет ни `aggregateRating`, ни `review` (настоящих отзывов у магазина нет), ни
 * сроков доставки в `Offer` (их нет и в тексте сайта — это фаза 5 плана).
 *
 * Узлы собираются функциями, а рисует их `components/JsonLd.tsx`.
 */

/** Узел разметки. Значения произвольные — схема проверяется Rich Results Test, не типами. */
export type IJsonLdNode = Record<string, unknown>

const SCHEMA_CONTEXT = 'https://schema.org'

const COUNTRY = { '@type': 'Country', name: 'Kyrgyzstan' } as const

const CURRENCY = 'KGS'

const CENTS_IN_UNIT = 100

/** Знак марки квадратом, 180×180 — `public/logo.png`. */
const LOGO_PATH = '/logo.png'

/**
 * Постоянный адрес магазина как сущности. Ссылаться на него из `Offer`
 * дешевле, чем повторять организацию целиком: поисковик склеивает узлы по
 * `@id` и видит одного продавца, а не по одному на каждый товар.
 */
const STORE_ID = `${absoluteUrl('/')}#store`

/** Цена в сомах: в базе и в API она целыми копейками (правило «деньги — `*_cents`»). */
function priceUnits(priceCents: number): string {
  return (priceCents / CENTS_IN_UNIT).toFixed(priceCents % CENTS_IN_UNIT === 0 ? 0 : 2)
}

/**
 * Магазин. Рисуется на всех страницах из `_app`.
 *
 * `sameAs` — не украшение: он связывает домен с реальными аккаунтами магазина
 * и помогает отличить `sululu.store` от чужих похожих имён. Пустой адрес бота
 * (локальная сборка без переменной окружения) в список не попадает — ссылка в
 * никуда хуже её отсутствия.
 *
 * `logo` — тот же знак марки, что в значке вкладки, но отдельным файлом и
 * размером, который поисковик берёт в карточку организации (у Google порог —
 * 112×112). Значок рядом со ссылкой в выдаче он не заменяет: тот берётся из
 * `favicon.ico` при обходе главной, и разметка на него не влияет.
 */
export function storeLd(): IJsonLdNode {
  const botUsername = publicConfig('telegramBotUsername')

  const sameAs = [INSTAGRAM_URL, botUsername === '' ? null : `https://t.me/${botUsername}`].filter(
    (link): link is string => link !== null
  )

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'OnlineStore',
    '@id': STORE_ID,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    description: SITE_DESCRIPTION,
    logo: absoluteUrl(LOGO_PATH),
    image: absoluteUrl(LOGO_PATH),
    areaServed: COUNTRY,
    currenciesAccepted: CURRENCY,
    sameAs,
  }
}

/**
 * Товар с предложением.
 *
 * `availability` у товара вне наличия — `PreOrder`, а не `OutOfStock`: у
 * магазина это не «кончилось», а «не в текущем сборе», и страница прямо
 * предлагает дождаться следующего. Описание берётся из базы, а когда владелец
 * его ещё не написал — то же самое, что стоит в `<meta name="description">`:
 * марка, название и цена. Ничего не выдумывается.
 *
 * У товара, который продаётся в нескольких объёмах, одного предложения нет:
 * цен столько же, сколько объёмов. Тогда пишется `AggregateOffer` с вилкой от
 * дешёвого к дорогому — это ровно то, что schema.org для такого и заводил, и
 * единственный честный способ не объявить цену 30 мл ценой товара.
 */
export function productLd(product: IProduct, categoryName: string | null): IJsonLdNode {
  const path = `/catalog/${product.slug}`
  const url = absoluteUrl(path)
  const hasSeveralVolumes = product.variants.length > 1
  const volume = formatVolume(product.volumeMl)
  const prices = product.variants.map(variant => variant.priceCents)
  /*
    Главная фотография первой: из списка поисковик берёт первую пригодную, и
    это должна быть та же карточка, что уходит в `og:image` и в каталог.
  */
  const images = [...product.images]
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
    .map(image => image.url)

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Product',
    name: productFullName(product),
    url,
    description: product.description ?? productDescription(product),
    ...(images.length > 0 && { image: images }),
    ...(product.brand !== null && { brand: { '@type': 'Brand', name: product.brand } }),
    ...(volume !== null && { size: volume }),
    ...(categoryName !== null && { category: categoryName }),
    offers: hasSeveralVolumes
      ? {
          '@type': 'AggregateOffer',
          url,
          priceCurrency: CURRENCY,
          lowPrice: priceUnits(Math.min(...prices)),
          highPrice: priceUnits(Math.max(...prices)),
          offerCount: product.variants.length,
          availability: product.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/PreOrder',
          areaServed: COUNTRY,
          seller: { '@id': STORE_ID },
        }
      : {
          '@type': 'Offer',
          url,
          priceCurrency: CURRENCY,
          price: priceUnits(product.priceCents),
          availability: product.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/PreOrder',
          areaServed: COUNTRY,
          seller: { '@id': STORE_ID },
        },
  }
}

/** Звено крошек: подпись и путь — ровно те же, что нарисованы на странице. */
export interface IBreadcrumb {
  name: string
  path: string
}

/**
 * Хлебные крошки.
 *
 * Список обязан совпадать с видимой цепочкой звено в звено, включая последнее:
 * поисковик сверяет разметку с разметкой страницы, а не принимает на веру.
 */
export function breadcrumbsLd(items: readonly IBreadcrumb[]): IJsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

/**
 * Список товаров страницы.
 *
 * Только адреса и подписи, без цен: цена живёт на самой карточке, и дублировать
 * её в списке значит завести второе место, где она может разойтись с каталогом.
 * `position` сквозной по странице выдачи, а не по всему каталогу.
 */
export function productListLd(products: readonly IProduct[]): IJsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'ItemList',
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: productFullName(product),
      url: absoluteUrl(`/catalog/${product.slug}`),
    })),
  }
}

/** Метка места ссылки в ответе — та же, что у `FaqAccordion`. */
const LINK_SLOT = '{link}'

/**
 * Ответ обычным текстом.
 *
 * На экране вместо `{link}` стоит ссылка с подписью `action.label`, а без
 * метки та же ссылка приписывается в конец — здесь повторяется ровно это
 * поведение, только подписью. Адрес в текст не попадает: в разметке он был бы
 * лишним, а отличаться от видимого ответа она не должна.
 */
function faqAnswer(item: IFaqItem): string {
  if (item.action === undefined) {
    return item.answer
  }

  return item.answer.includes(LINK_SLOT)
    ? item.answer.replace(LINK_SLOT, item.action.label)
    : `${item.answer} ${item.action.label}`
}

/**
 * Блок «Что обычно спрашивают».
 *
 * Принимает тот же массив, которым набрана секция на главной: разметка,
 * собранная из отдельной копии текстов, разошлась бы с видимыми ответами при
 * первой же правке — а это ровно то, за что снимают расширенный сниппет.
 */
export function faqLd(items: readonly IFaqItem[]): IJsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: faqAnswer(item) },
    })),
  }
}
