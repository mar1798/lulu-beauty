/**
 * Описание, заведённое до редактора, — простой текст с переносами, который
 * витрина показывала через `white-space: pre-line`. Редактору нужен HTML, и
 * перевод повторяет то, как этот текст выглядел: пустая строка разделяет
 * абзацы, одиночный перенос остаётся переносом внутри абзаца.
 */
export function plainTextToHtml(text: string): string {
  const escape = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return text
    .trim()
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph !== '')
    .map(paragraph => `<p>${paragraph.split('\n').map(escape).join('<br>')}</p>`)
    .join('')
}

/**
 * Адрес ссылки, как его понимает описание: `https://`, почта или телефон.
 *
 * Набранное без схемы достраивается — владелец вставляет «brand.com», а не
 * «https://brand.com». Всё прочее (`javascript:`, `data:`) — `null`: такой
 * адрес всё равно выбросят бэкенд и `RichText`, и лучше сказать об этом
 * сразу, чем молча потерять ссылку при сохранении.
 */
export function normalizeLinkHref(raw: string): string | null {
  const value = raw.trim()

  if (value === '') {
    return null
  }

  if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(value)) {
    return value
  }

  if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(value)) {
    return `mailto:${value}`
  }

  if (/^\+?[\d\s()-]{6,}$/.test(value)) {
    return `tel:${value.replace(/[^\d+]/g, '')}`
  }

  // Своя схема у адреса есть, но не из разрешённых — не угадываем.
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[^:]+:\d/.test(value)) {
    return null
  }

  return /^[^\s]+\.[^\s]+$/.test(value) ? `https://${value}` : null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Сколько видимых символов в HTML описания — без тегов и без переносов между
 * абзацами. Та же мера, что у счётчика редактора (`textContent` документа)
 * и у бэкенда (`MAX_DESCRIPTION_LENGTH`), чтобы форма не пропустила то, что
 * сервер отвергнет.
 *
 * Без `DOMParser`: форма считает это и при рендере на сервере, где его нет.
 */
export function richTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) {
        return String.fromCodePoint(parseInt(code.slice(2), 16))
      }

      if (code.startsWith('#')) {
        return String.fromCodePoint(parseInt(code.slice(1), 10))
      }

      return ENTITIES[code.toLowerCase()] ?? entity
    }).length
}
