import { useEffect, useState } from 'react'
import { onIdle } from '@/utils/idle'

/**
 * Крайний срок отсрочки. Простоя может не случиться вовсе (опрос `/auth/
 * telegram/poll` раз в две секунды не даёт вкладке затихнуть), а код всё-таки
 * нужен — но не раньше, чем экран собран.
 */
const QR_IDLE_TIMEOUT_MS = 2000

/**
 * QR со ссылкой — картинкой в `data:`-URL.
 *
 * Кодировщик (`qrcode`) грузится **динамически**: он нужен ровно на одном
 * экране, а статический импорт утащил бы его в общий чанк и заставил бы платить
 * за него каждую страницу каталога.
 *
 * Отдельного состояния ошибки нет намеренно: не собравшийся QR — это не сбой
 * входа, а отсутствие удобства. Кнопка «Войти через Telegram» рядом работает.
 *
 * И загрузка кодировщика, и само кодирование ждут простоя браузера: 23 кБ
 * разбора и полсекунды работы главного потока на мобильном процессоре — это
 * замер Lighthouse, и приходились они ровно на тот момент, когда человек
 * смотрит на экран и читает инструкцию. QR тут не главное: войти можно кнопкой
 * рядом, а код нужен тем, кто сканирует его другим телефоном, — секунда
 * отсрочки им ничего не стоит.
 */

/**
 * Результат хранится **вместе со ссылкой**, для которой он посчитан, и старый
 * QR отсеивается сравнением, а не сбросом в эффекте: синхронный `setState`
 * внутри `useEffect` здесь запрещён линтером (и правильно — это лишний рендер
 * ради того, что и так выводится из пропсов).
 */
interface IEncoded {
  value: string
  /** `null` — кодировщик отказал: место под код резервировать больше незачем. */
  dataUrl: string | null
}

export interface IQrCode {
  /** `null` и пока считается, и если посчитать не вышло — различает это `isFailed`. */
  dataUrl: string | null
  /**
   * Кода не будет: загрузка кодировщика или само кодирование не удались.
   *
   * Нужно странице входа: до ответа место под код держится пустой подложкой
   * (иначе появление кода сдвигает подвал), а вот держать её вечно из-за
   * отказа — значит показывать белый квадрат вместо кода.
   */
  isFailed: boolean
}

export const useQrCode = (value: string | null): IQrCode => {
  const [encoded, setEncoded] = useState<IEncoded | null>(null)

  useEffect(() => {
    if (value === null) {
      return
    }

    let isCancelled = false

    const build = async (): Promise<void> => {
      try {
        const { toDataURL } = await import('qrcode')
        const dataUrl = await toDataURL(value, { margin: 1, width: 180 })

        if (!isCancelled) {
          setEncoded({ value, dataUrl })
        }
      } catch {
        // Молча — для человека это не сбой входа (см. выше), но место под код
        // после отказа держать незачем.
        if (!isCancelled) {
          setEncoded({ value, dataUrl: null })
        }
      }
    }

    const cancelIdle = onIdle(() => {
      void build()
    }, QR_IDLE_TIMEOUT_MS)

    return () => {
      isCancelled = true
      /*
        Отмена простоя и `isCancelled` — про разные моменты: первая снимает
        работу, которая ещё не началась, второй гасит `setState` у той, что уже
        началась и вот-вот вернётся.
      */
      cancelIdle()
    }
  }, [value])

  // Счёт идёт только по коду, посчитанному для текущей ссылки: прошлый ведёт
  // на мёртвую сессию входа.
  const current = encoded !== null && encoded.value === value ? encoded : null

  return {
    dataUrl: current?.dataUrl ?? null,
    isFailed: current !== null && current.dataUrl === null,
  }
}
