import type { IProduct } from 'widgets/types'
import { formatPrice } from 'widgets/atoms'
import { formatVolume, formatVolumes } from 'widgets/utils'
import { publicConfig } from '@/сonfig'

/**
 * Тексты для поисковика: `<title>` и `<meta name="description">`.
 *
 * Вынесены из страниц отдельно, потому что формулы у всех типов страниц общие
 * и одинаково завязаны на длину: `<title>` поисковик обрезает примерно на 60
 * знаках, описание — на 160. Обрезает он **с конца**, поэтому порядок слов в
 * формулах не декоративный: сначала то, по чему ищут (марка, название, гео),
 * в хвосте — то, что не жалко потерять.
 *
 * Гео в заголовке стоит намеренно: по общим запросам каталог из четырёх
 * десятков позиций не конкурирует с магазинами на тысячи, и весь расчёт на
 * длинный хвост «марка + товар + Бишкек» (`SEO_PLAN.md`).
 *
 * Ничего не выдумывается: в тексты попадает только то, что есть в БД. У товара
 * без описания получается описание из марки, названия и цены — короче, но
 * правда.
 */

export const SITE_NAME = 'Sululu'

/**
 * Заголовок и описание главной. Гео здесь не для красоты: «Бишкек» — половина
 * запроса, по которому этот магазин вообще можно найти.
 */
export const SITE_TITLE = 'Sululu — корейская косметика в Бишкеке по самым низким ценам'

export const SITE_DESCRIPTION =
  'Корейская косметика и уход в Бишкеке по самым низким ценам: берём напрямую и общим заказом. Соберите заявку до закрытия сбора — подтвердим её в Telegram.'

/**
 * Адрес страницы, каким его видит внешний мир. Относительный путь тут не
 * годится нигде: ни скрапер превью, ни разметка `JSON-LD` базы не имеют.
 */
export function absoluteUrl(path: string): string {
  return `${publicConfig('siteUrl')}${path}`
}

/** Дальше поисковик всё равно обрежет — считаем это потолком, а не желаемым. */
const TITLE_LIMIT = 60

const DESCRIPTION_LIMIT = 160

const CITY = 'Бишкеке'

/** Хвост описания: общий для всех страниц и потому наименее ценный — уходит первым. */
const DELIVERY_NOTE = 'Доставка по Бишкеку и Кыргызстану, заявка через Telegram.'

/**
 * Обрезка по границе слова.
 *
 * `slice(0, 160)` рубит посреди слова, и в выдаче это видно: описание
 * обрывается огрызком. Здесь строка укорачивается до последнего пробела,
 * с неё снимается повисшая запятая или тире, и ставится многоточие.
 */
function clamp(text: string, limit: number): string {
  if (text.length <= limit) {
    return text
  }

  const cut = text.slice(0, limit - 1)
  const lastSpace = cut.lastIndexOf(' ')

  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/u, '')}…`
}

/**
 * Марка и название одной строкой.
 *
 * Название в каталоге иногда уже начинается с марки («Celimax Pore+Dark Spot
 * Brightening Serum» при марке «Celimax»), потому что и то и другое приходит
 * из прайса импортом. Подставлять марку вторым слоем в таких случаях нельзя —
 * получится «Celimax Celimax Pore+…».
 */
export function productFullName(product: IProduct): string {
  const brand = product.brand?.trim() ?? ''
  const name = product.name.trim()

  if (brand === '' || name.toLowerCase().startsWith(brand.toLowerCase())) {
    return name
  }

  return `${brand} ${name}`
}

/**
 * Заголовок товара.
 *
 * Варианты перечислены от полного к короткому; берётся первый, который
 * помещается в 60 знаков. Порядок потерь — от наименее ценного: сначала уходит
 * имя магазина (марка в заголовке и так есть), потом объём, потом цена.
 * Название товара не режется никогда: обрубок в выдаче хуже длинного заголовка,
 * который поисковик обрежет сам.
 */
export function productTitle(product: IProduct): string {
  const name = productFullName(product)
  const volume = productVolumeLabel(product)
  const withVolume = volume === null ? name : `${name}, ${volume}`
  const price = productPriceLabel(product)

  const variants = [
    `${withVolume} — купить в ${CITY}, ${price} | ${SITE_NAME}`,
    `${withVolume} — купить в ${CITY}, ${price}`,
    `${name} — купить в ${CITY}, ${price}`,
    `${name} — купить в ${CITY}`,
  ]

  // Последний вариант отдаётся даже когда он длиннее лимита: гео — то самое
  // слово, ради которого этот заголовок вообще переписан, и терять его, лишь бы
  // уложиться в 60 знаков, значит выкинуть весь смысл правки.
  return variants.find(variant => variant.length <= TITLE_LIMIT) ?? variants[variants.length - 1]
}

/**
 * Объём товара для заголовка: «50 мл» у обычного, «30 / 50 мл» у того, что
 * продаётся в нескольких. У второго `volumeMl` пуст — одним числом его не
 * описать, — и без этого из заголовка пропало бы то, по чему товар ищут.
 */
function productVolumeLabel(product: IProduct): string | null {
  return product.variants.length > 1
    ? formatVolumes(product.variants)
    : formatVolume(product.volumeMl)
}

/**
 * Цена для заголовка и описания. «от» у товара в нескольких объёмах:
 * `priceCents` там — цена самого дешёвого, и без оговорки выдача обещала бы
 * её за любой из них.
 */
function productPriceLabel(product: IProduct): string {
  const price = formatPrice(product.priceCents)

  return product.variants.length > 1 ? `от ${price}` : price
}

/** Первое предложение описания — ровно та «краткая польза», которой в БД отдельного поля нет. */
function firstSentence(text: string): string | null {
  const trimmed = text.trim()

  if (trimmed === '') {
    return null
  }

  const [sentence] = trimmed.split(/(?<=[.!?])\s/u)
  const benefit = sentence ?? trimmed

  // Точка в конце не косметика: без неё описание товара сцепляется с хвостом
  // про доставку в одно предложение — «…острова Токто Доставка по Бишкеку».
  return /[.!?]$/u.test(benefit) ? benefit : `${benefit}.`
}

/**
 * Описание товара.
 *
 * Собирается из трёх частей по убыванию ценности: цена с маркой, польза из
 * описания товара (если владелец его заполнил) и общий хвост про доставку.
 * Хвост стоит последним не по привычке: он же первым и пропадает, когда
 * описание товара оказывается длинным.
 */
export function productDescription(product: IProduct): string {
  const benefit = product.description == null ? null : firstSentence(product.description)

  const head = [
    `${productFullName(product)} по низкой цене — ${productPriceLabel(product)}.`,
    benefit,
  ]
    .filter((part): part is string => part !== null)
    .join(' ')

  const withNote = `${head} ${DELIVERY_NOTE}`

  // Хвост приписывается только целиком. Обрезанный по лимиту, он оставляет в
  // выдаче обрывок вроде «доставка по Бишкеку и…» — это хуже, чем его
  // отсутствие, а `clamp` остаётся страховкой на случай длинного описания.
  return withNote.length <= DESCRIPTION_LIMIT ? withNote : clamp(head, DESCRIPTION_LIMIT)
}

export const CATALOG_TITLE = `Каталог корейской косметики — купить в ${CITY} | ${SITE_NAME}`

export const CATALOG_DESCRIPTION =
  'Корейская косметика в Бишкеке по самым низким ценам: уход за лицом и волосами, ' +
  'наборы, гаджеты. Доставка по Кыргызстану, заявка через Telegram.'
