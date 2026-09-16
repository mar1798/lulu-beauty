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
 * что ISR не может отдать данные старше, чем отдал бы без него. Ревалидация по
 * требованию (`pages/api/revalidate.ts`) короче обоих сроков, поэтому сбрасывает
 * кеш сама: иначе страница, пересобранная сразу после правки категории, взяла бы
 * её прежнее имя и застыла с ним ещё на минуту.
 */

const TTL_MS = 60_000

interface ICached {
  at: number
  value: Promise<unknown>
}

/**
 * Состояние кеша живёт на `globalThis`, а не в модуле.
 *
 * Серверная сборка Next не делит код между входами: каждая страница и каждая
 * ручка `pages/api/*` получают **свою копию** этого модуля. Сбрось кеш из ручки
 * ревалидации — и обнулилась бы её собственная копия, а `getStaticProps`
 * каталога продолжил бы читать свою. Один разделяемый `Symbol.for` — ровно то,
 * что делает сброс общим.
 */
const STORE = Symbol.for('sululu.staticData')

type IStore = Map<string, ICached>

const store = (): IStore => {
  const holder = globalThis as typeof globalThis & { [STORE]?: IStore }

  holder[STORE] ??= new Map<string, ICached>()

  return holder[STORE]
}

/** Забыть всё закешированное. Следующий запрос сходит за свежим. */
export const resetSharedStaticData = (): void => {
  store().clear()
}

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
const memoize = <T>(name: string, load: () => Promise<T>): (() => Promise<T>) => {
  return () => {
    const cache = store()
    const now = Date.now()
    const cached = cache.get(name)

    if (cached !== undefined && now - cached.at < TTL_MS) {
      return cached.value as Promise<T>
    }

    const started = load()

    cache.set(name, { at: now, value: started })

    void started.catch(() => {
      // Только свою запись: за время запроса её мог сменить более поздний вызов.
      if (cache.get(name)?.value === started) {
        cache.delete(name)
      }
    })

    return started
  }
}

const categories = memoize('categories', listCategories)
const activeCycle = memoize('active-cycle', getActiveCycleOrNull)
