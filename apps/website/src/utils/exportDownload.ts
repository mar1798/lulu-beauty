import { isEmbeddedWindow } from '@/utils/embedding'
import { loadTelegramWebApp, readMiniAppInitData } from '@/utils/telegramMiniApp'

/**
 * Скачивание выгрузки там, где `saveBlob` не срабатывает.
 *
 * Браузер и Mini App Telegram молча игнорируют `<a download>` с blob-адресом: кнопка
 * выгрузки крутилась и останавливалась, ни файла, ни ошибки. Там файл берётся по
 * подписанной ссылке (`createExportLink`), которую скачивает уже не страница:
 *
 * - в Mini App — сам Telegram (`WebApp.downloadFile`, Bot API 8.0), а в клиентах
 *   постарше — внешний браузер (`openLink`);
 * - во встроенном браузере Telegram SDK не работает, и адрес просто открывается:
 *   ответ с `Content-Disposition: attachment` страницу не заменяет, а уходит в загрузки
 *   (Android) или в просмотр файла (iOS).
 */

/** Нужна ли подписанная ссылка вместо `saveBlob`. Telegram Web показывает Mini App во фрейме. */
export const needsLinkDownload = (): boolean =>
  typeof window !== 'undefined' &&
  (readMiniAppInitData() !== null || 'TelegramWebviewProxy' in window || isEmbeddedWindow())

/** Версия Bot API, с которой у Mini App есть `downloadFile`. */
const DOWNLOAD_FILE_VERSION = '8.0'

export const openDownloadLink = async (url: string, fileName: string): Promise<void> => {
  if (readMiniAppInitData() !== null) {
    const app = await loadTelegramWebApp()

    if (app?.downloadFile !== undefined && app.isVersionAtLeast?.(DOWNLOAD_FILE_VERSION) === true) {
      app.downloadFile({ url, file_name: fileName })

      return
    }

    if (app?.openLink !== undefined) {
      app.openLink(url)

      return
    }
  }

  window.location.assign(url)
}
