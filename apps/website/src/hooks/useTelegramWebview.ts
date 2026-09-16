import { useSyncExternalStore } from 'react'

/**
 * Открыт ли сайт во встроенном браузере Telegram.
 *
 * Речь не про Mini App (тот распознаётся подписью в адресе — см.
 * `readMiniAppInitData`), а про обычную ссылку, нажатую в переписке: Telegram
 * открывает её своим браузером, а не системным.
 *
 * Опознать его нечем, кроме этого моста: user-agent там неотличим от Safari
 * (`Version/26.5.2 Mobile Safari/604.1`, ни слова про Telegram), `referrer`
 * пуст. `TelegramWebviewProxy` Telegram кладёт в окно сам — он же переносит
 * события в Mini App, но существует в любой открытой этим браузером странице.
 *
 * Нужно ради шапки: `fixed` и `sticky` в этом окружении рисуются с изъяном —
 * см. `unpinned` в `packages/widgets/src/organisms/header/Header.css.ts`.
 */

/**
 * Подписка-пустышка: окно браузером не подменяется, значение за жизнь
 * страницы не меняется ни разу, и отписывать нечего.
 */
const subscribe = (): (() => void) => (): void => {}

const getSnapshot = (): boolean => 'TelegramWebviewProxy' in window

/**
 * На сервере — всегда «нет». Страницы собираются статически, окна там не
 * существует, и любой другой ответ, вшитый в разметку, был бы неверен ровно
 * для тех, ради кого проверка и делается. Верное значение подставит первая
 * же отрисовка в браузере — этим `useSyncExternalStore` и отличается от
 * состояния, выставляемого эффектом.
 */
const getServerSnapshot = (): boolean => false

export const useTelegramWebview = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
