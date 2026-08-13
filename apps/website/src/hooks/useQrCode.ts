import { useEffect, useState } from 'react'

/**
 * QR со ссылкой — картинкой в `data:`-URL.
 *
 * Кодировщик (`qrcode`) грузится **динамически**: он нужен ровно на одном
 * экране, а статический импорт утащил бы его в общий чанк и заставил бы платить
 * за него каждую страницу каталога.
 *
 * Отдельного состояния ошибки нет намеренно: не собравшийся QR — это не сбой
 * входа, а отсутствие удобства. Кнопка «Войти через Telegram» рядом работает.
 */

/**
 * Результат хранится **вместе со ссылкой**, для которой он посчитан, и старый
 * QR отсеивается сравнением, а не сбросом в эффекте: синхронный `setState`
 * внутри `useEffect` здесь запрещён линтером (и правильно — это лишний рендер
 * ради того, что и так выводится из пропсов).
 */
interface IEncoded {
  value: string
  dataUrl: string
}

export const useQrCode = (value: string | null): string | null => {
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
        // Молча: см. про «не сбой входа» выше.
      }
    }

    void build()

    return () => {
      isCancelled = true
    }
  }, [value])

  return encoded !== null && encoded.value === value ? encoded.dataUrl : null
}
