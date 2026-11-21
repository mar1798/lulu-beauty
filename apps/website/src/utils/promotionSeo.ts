import type { IPublicPromotion } from 'widgets/types'

/**
 * Заголовок и описание страницы акции для поисковика и превью ссылки.
 *
 * Лежат отдельно от `utils/seo.ts`: тот тянет цены из виджетов, а эти функции
 * чистые и проверяются тестами. Ничего не выдумывается - описание берётся из
 * текста самого владельца, а без него говорит только то, что есть у акции: срок.
 */

const TITLE_SUFFIX = ' - акция Sululu'
const DESCRIPTION_LIMIT = 160

const TAGS = /<[^>]*>/g
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/**
 * Текст описания без разметки. Описание уже очищено бэкендом (`rich_text.py`) до
 * абзацев, списков и ссылок, поэтому достаточно убрать теги и вернуть пробелы на
 * границах блоков: «</p><p>» - это не склейка слов.
 */
export const promotionPlainText = (html: string | null): string => {
  if (html === null) {
    return ''
  }

  return html
    .replace(/<\/(p|li|h2)>|<br\s*\/?>/gi, ' ')
    .replace(TAGS, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, entity => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
}

export const promotionTitle = (promotion: Pick<IPublicPromotion, 'title'>): string =>
  `${promotion.title}${TITLE_SUFFIX}`

const clamp = (text: string): string => {
  if (text.length <= DESCRIPTION_LIMIT) {
    return text
  }

  const cut = text.slice(0, DESCRIPTION_LIMIT - 1)
  const lastSpace = cut.lastIndexOf(' ')

  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:-]+$/u, '')}…`
}

/**
 * Описание владельца, обрезанное до длины сниппета; без него - название и срок. У акции
 * без даты окончания назван только старт: что она бессрочная, покупателю не говорим.
 */
export const promotionDescription = (
  promotion: Pick<IPublicPromotion, 'title' | 'descriptionHtml' | 'startsAt' | 'endsAt'>,
  formatDate: (iso: string) => string
): string => {
  const text = promotionPlainText(promotion.descriptionHtml)

  if (text !== '') {
    return clamp(text)
  }

  return clamp(
    promotion.endsAt === null
      ? `${promotion.title} - с ${formatDate(promotion.startsAt)}.`
      : `${promotion.title} - до ${formatDate(promotion.endsAt)}.`
  )
}
