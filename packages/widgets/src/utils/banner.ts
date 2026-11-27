import type { BannerKind, BannerState } from '../types'

/**
 * Баннеры карусели: подписи состояний и проверка ссылки новости.
 *
 * Пределы повторяют бэкенд (`app/common/limits.py`, `app/banners/links.py`): форма
 * отказывает раньше, чем уйдёт запрос, а API всё равно проверяет сам.
 */

export const NEWS_TITLE_MAX = 120
export const NEWS_TEXT_MAX = 300
export const NEWS_CTA_MAX = 40
export const NEWS_LINK_MAX = 2048
export const MAX_NEWS_BANNERS = 20

/** Подпись кнопки текстового слайда, когда владелец свою не задал. */
export const DEFAULT_CTA_LABEL = 'Подробнее'

const STATE_LABELS: Record<BannerState, string> = {
  PROMOTION_OFF: 'Акция выключена',
  FINISHED: 'Завершена',
  SCHEDULED: 'Запланирована',
  NO_IMAGE: 'Нет мобильного баннера',
  HIDDEN: 'Скрыт',
  SHOWN: 'В карусели',
}

/** Все состояния без вида: у новости «Завершена» читается как «Истекла», см. `bannerStateLabel`. */
export const BANNER_STATE_LABELS = STATE_LABELS

export const BANNER_STATE_TONES: Record<BannerState, 'neutral' | 'success' | 'info' | 'warning'> = {
  PROMOTION_OFF: 'warning',
  FINISHED: 'neutral',
  SCHEDULED: 'info',
  NO_IMAGE: 'warning',
  HIDDEN: 'neutral',
  SHOWN: 'success',
}

export const BANNER_KIND_LABELS: Record<BannerKind, string> = {
  PROMOTION: 'Акция',
  NEWS: 'Новость',
}

export const bannerStateLabel = (kind: BannerKind, state: BannerState): string =>
  kind === 'NEWS' && state === 'FINISHED' ? 'Истекла' : STATE_LABELS[state]

/** Управляющие символы и пробелы: ссылка с ними не открывается или читается иначе, чем набрана. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\s\u0000-\u001f\u007f]/

/**
 * Куда может вести новость: путь на сайте (`/catalog`) или адрес `https://`.
 * `http:`, `javascript:`, `data:` и `//host` (путь, который браузер читает как чужой
 * сайт) не годятся.
 */
export const isValidBannerLink = (url: string): boolean => {
  if (url === '' || FORBIDDEN_CHARS.test(url) || url.includes('\\')) {
    return false
  }

  if (url.startsWith('/')) {
    return !url.startsWith('//')
  }

  if (!url.startsWith('https://')) {
    return false
  }

  // `new URL('https:///path')` молча делает хостом «path»: пустой адрес сервера отсекаем сами.
  if (/^https:\/\/[/?#]/.test(url) || url === 'https://') {
    return false
  }

  try {
    return new URL(url).hostname !== ''
  } catch {
    return false
  }
}

export const isExternalBannerLink = (url: string): boolean => url.startsWith('https://')
