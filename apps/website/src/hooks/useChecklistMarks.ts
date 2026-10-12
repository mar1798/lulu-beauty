import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Отметки «куплено» в чек-листе закупки — в `localStorage` этого браузера.
 *
 * Не на сервере: отметка нужна одному человеку с одним телефоном на время
 * похода по магазину, и строка в базе ради неё — миграция и ручка без
 * причины. Зато перезагрузка страницы или закрытый Telegram их не стирают.
 *
 * Хранится список одного сбора. Открылся новый — старые отметки ему не
 * принадлежат и выбрасываются при первой же записи, так что хранилище не
 * копит историю.
 *
 * Хранилища может не быть вовсе (приватный режим, запрет сайта) — тогда
 * отметки живут до перезагрузки, а страница работает как обычно.
 */

const STORAGE_KEY = 'lb-checklist'

interface IStoredMarks {
  cycleId: string
  keys: string[]
}

/** Запасное место, когда `localStorage` бросает: отметки доживут до перезагрузки. */
let memoryValue: string | null = null

const listeners = new Set<() => void>()

const readRaw = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return memoryValue
  }
}

const writeRaw = (value: string): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    memoryValue = value
  }

  listeners.forEach(listener => listener())
}

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange)
  // Вторая вкладка с тем же списком тоже видит отметки.
  window.addEventListener('storage', onChange)

  return (): void => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

const parseMarks = (raw: string | null, cycleId: string): string[] => {
  if (raw === null) {
    return []
  }

  try {
    const stored = JSON.parse(raw) as Partial<IStoredMarks>

    return stored.cycleId === cycleId && Array.isArray(stored.keys) ? stored.keys : []
  } catch {
    return []
  }
}

export interface IChecklistMarks {
  checkedKeys: string[]
  toggle: (key: string, checked: boolean) => void
  reset: () => void
}

export const useChecklistMarks = (cycleId: string | null): IChecklistMarks => {
  // На сервере хранилища нет: статическая страница рендерится без отметок, а
  // первая отрисовка в браузере подставляет сохранённые.
  const raw = useSyncExternalStore(subscribe, readRaw, (): string | null => null)

  const checkedKeys = useMemo(
    () => (cycleId === null ? [] : parseMarks(raw, cycleId)),
    [raw, cycleId]
  )

  const update = useCallback(
    (next: (current: string[]) => string[]) => {
      if (cycleId === null) {
        return
      }

      // Перечитывается из хранилища, а не берётся из рендера: два быстрых нажатия
      // подряд иначе писали бы поверх друг друга.
      const keys = next(parseMarks(readRaw(), cycleId))
      writeRaw(JSON.stringify({ cycleId, keys } satisfies IStoredMarks))
    },
    [cycleId]
  )

  const toggle = useCallback(
    (key: string, checked: boolean) => {
      update(current => {
        const rest = current.filter(existing => existing !== key)

        return checked ? [...rest, key] : rest
      })
    },
    [update]
  )

  const reset = useCallback(() => {
    update(() => [])
  }, [update])

  return { checkedKeys, toggle, reset }
}
