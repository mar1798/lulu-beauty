import type { ICategory, IOrderCycle } from 'widgets/types'
import { listCategories } from '@/services/endpoints/catalog'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'

/**
 * Данные, одинаковые для всех статических страниц, — с общим кешем на сборку.
 *
 * `getStaticPaths` карточки товара пререндерит до двух тысяч slug'ов, и каждый её
 * `getStaticProps` просил список категорий и активный сбор заново: `services/api.ts`
 * — это голый `fetch` без кеша, а Pages Router ничего не дедуплицирует. Итого до
 * четырёх тысяч лишних запросов за сборку и столько же при фоновой ревалидации.
 *
 * Кеш живёт ровно `TTL_MS` — столько же, сколько `revalidate` самих страниц, так
 * что ISR не может отдать данные старше, чем отдал бы без него.
 */

const TTL_MS = 60_000

export const sharedCategories = (): Promise<ICategory[]> => categories()

export const sharedActiveCycle = (): Promise<IOrderCycle | null> => activeCycle()

/**
 * Кеширует **обещание**, а не результат: параллельные `getStaticProps` (Next
 * генерирует страницы пачками) попадают на один и тот же незавершённый запрос
 * вместо того, чтобы завести каждый свой.
 *
 * Отказ не кешируется — иначе одна сетевая осечка в начале сборки распространилась
 * бы на всю пачку страниц, которую она успела бы накрыть.
 */
const memoize = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let cached: { at: number; value: Promise<T> } | null = null

  return () => {
    const now = Date.now()

    if (cached !== null && now - cached.at < TTL_MS) {
      return cached.value
    }

    const started = load()

    cached = { at: now, value: started }

    void started.catch(() => {
      cached = null
    })

    return started
  }
}

const categories = memoize(listCategories)
const activeCycle = memoize(getActiveCycleOrNull)
