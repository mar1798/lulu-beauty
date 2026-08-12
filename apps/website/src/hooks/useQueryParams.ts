import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import type { ParsedUrlQuery } from 'querystring'
import { useDebouncedValue } from 'widgets/hooks'

/**
 * Параметры выборки — в адресной строке.
 *
 * Списки товаров (каталог и админка) держат в query всё, что уходит в запрос к
 * API: категорию, поиск, страницу, показ удалённых. Ссылкой на конкретную
 * выборку можно поделиться или положить её в закладки, а «назад» возвращает к
 * прошлому набору фильтров, а не уводит со страницы.
 *
 * Значения по умолчанию в адрес не пишутся: `/catalog` остаётся `/catalog`, а
 * не превращается в `/catalog?q=&page=1`.
 */

/** Описание одного параметра: как прочитать его из адреса и как записать обратно. */
export interface IQueryParam<TValue> {
  parse: (raw: string | null) => TValue
  /** `null` — значение по умолчанию: параметр из адреса убирается. */
  serialize: (value: TValue) => string | null
}

/** Строка; пустая — то же самое, что отсутствующий параметр. */
export const textParam: IQueryParam<string> = {
  parse: raw => raw ?? '',
  serialize: value => (value === '' ? null : value),
}

/** Строка, у которой «ничего не выбрано» — осмысленное состояние (категория). */
export const optionalTextParam: IQueryParam<string | null> = {
  parse: raw => (raw === null || raw === '' ? null : raw),
  serialize: value => (value === null || value === '' ? null : value),
}

/** Номер страницы: мусор и всё, что меньше единицы, схлопывается в первую. */
export const pageParam: IQueryParam<number> = {
  parse: raw => {
    const parsed = Number(raw)

    return raw === null || !Number.isInteger(parsed) || parsed < 1 ? 1 : parsed
  },
  serialize: value => (value <= 1 ? null : String(value)),
}

/** Флаг; в адресе — `1`, выключенный не пишется вовсе. */
export const flagParam: IQueryParam<boolean> = {
  parse: raw => raw === '1' || raw === 'true',
  serialize: value => (value ? '1' : null),
}

const firstQueryValue = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

const parseQuery = <TValues extends Record<string, unknown>>(
  spec: { [K in keyof TValues]: IQueryParam<TValues[K]> },
  query: ParsedUrlQuery
): TValues => {
  const values = {} as TValues

  for (const key of Object.keys(spec) as Array<keyof TValues & string>) {
    values[key] = spec[key].parse(firstQueryValue(query[key]))
  }

  return values
}

interface INavigateOptions {
  /**
   * Заменить текущую запись в истории вместо новой. Для «шумных» параметров
   * вроде поиска: иначе каждая пауза в наборе оставляла бы шаг в истории и
   * «назад» пришлось бы жать по разу на букву.
   */
  replace?: boolean
}

type ISetQueryParams<TValues> = (patch: Partial<TValues>, options?: INavigateOptions) => void

/**
 * Читает параметры из адреса по описанию `spec` и возвращает функцию, которая
 * пишет их обратно (`shallow` — данные тянет `useSWR` на странице, повторный
 * `getServerSideProps` тут не нужен).
 *
 * Ключи, которых нет в `spec`, при записи сохраняются — чужие метки вроде
 * `utm_*` фильтр не должен вычищать.
 */
export const useQueryParams = <TValues extends Record<string, unknown>>(spec: {
  [K in keyof TValues]: IQueryParam<TValues[K]>
}): [TValues, ISetQueryParams<TValues>] => {
  const router = useRouter()

  const values = parseQuery(spec, router.query)

  /*
    `spec` — литерал, пересобираемый на каждый рендер, поэтому в колбэк он
    попадает через ref: иначе `setParams` менял бы идентичность каждый рендер и
    тянул за собой всех, кто держит его в зависимостях. Отставание ref на рендер
    безвредно — меняется только идентичность объекта, но не сами разборщики.
  */
  const specRef = useRef(spec)

  useEffect(() => {
    specRef.current = spec
  })

  const setParams = useCallback<ISetQueryParams<TValues>>(
    (patch, options) => {
      const current = specRef.current
      // Не из `values` замыкания: между рендером и кликом адрес мог уже уехать.
      const previous = parseQuery(current, router.query)
      const query: ParsedUrlQuery = { ...router.query }

      for (const key of Object.keys(current) as Array<keyof TValues & string>) {
        const value = key in patch ? (patch[key] as TValues[typeof key]) : previous[key]
        const raw = current[key].serialize(value)

        if (raw === null) {
          delete query[key]
        } else {
          query[key] = raw
        }
      }

      const target = { pathname: router.pathname, query }

      if (options?.replace === true) {
        void router.replace(target, undefined, { shallow: true })
      } else {
        void router.push(target, undefined, { shallow: true })
      }
    },
    [router]
  )

  return [values, setParams]
}

/**
 * Поле ввода поверх текстового параметра из адреса.
 *
 * Ввод должен отзываться на каждый символ, а адрес — меняться, когда человек
 * закончил печатать, поэтому текст живёт в локальном состоянии и уезжает в
 * query с задержкой. Обратная синхронизация нужна для «назад»/«вперёд» и для
 * SSG-страниц, где `router.query` наполняется только после гидратации.
 *
 * `committedRef` хранит последнее значение, о котором стороны уже договорились:
 * без него ответ адреса на нашу же запись возвращал бы в поле устаревший текст,
 * если за время задержки успели дописать ещё пару букв.
 */
export const useQueryTextInput = (
  value: string,
  commit: (next: string) => void,
  delay?: number
): [string, (next: string) => void] => {
  const [text, setText] = useState(value)
  const debounced = useDebouncedValue(text, delay)
  const committedRef = useRef(value)

  useEffect(() => {
    if (debounced !== committedRef.current) {
      committedRef.current = debounced
      commit(debounced)
    }
  }, [debounced, commit])

  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value
      setText(value)
    }
  }, [value])

  return [text, setText]
}
