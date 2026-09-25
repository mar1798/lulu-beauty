import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import type { ISearchSuggestGroup, ISearchSuggestItem } from 'widgets/types'
import { useDebouncedValue } from 'widgets/hooks'
import { HeaderSearch } from 'widgets/organisms'
import {
  SUGGEST_MAX_LENGTH,
  SUGGEST_MIN_LENGTH,
  suggestSearch,
  type ISearchSuggestions,
} from '@/services/endpoints/catalog'
import { searchSuggestKey } from '@/services/swrKeys'
import { INSTAGRAM_URL } from '@/utils/contacts'
import { WantedProductPrompt } from './WantedProductPrompt'

/**
 * Поиск в шапке, подключённый к каталогу.
 *
 * Виджет (`HeaderSearch`) презентационный: он рисует поле и список, а откуда
 * берутся подсказки и куда ведут строки — знает только сайт. Здесь и живёт
 * это знание: запрос с дебаунсом, три группы и адреса, которые из них
 * получаются.
 *
 * Адреса те же самые, что у фильтров каталога (`useQueryParams` на
 * `/catalog`): категория фильтруется слагом, бренд — полным названием (своей
 * таблицы у брендов нет, см. `IProductListParams`). Поэтому строка списка — это
 * ровно ссылка на уже отфильтрованный каталог, а не отдельный режим поиска.
 *
 * Ошибка запроса наружу не показывается — сознательно. Это подсказка поверх
 * работающей страницы: не приехала — человек дожимает Enter и попадает в
 * каталог, где поиск повторится уже со своим сообщением об ошибке
 * (`catalog.search`). Красная плашка под шапкой на каждой странице сайта
 * стоила бы куда дороже несостоявшейся подсказки.
 */

const catalogHref = (params: Record<string, string>): string =>
  `/catalog?${new URLSearchParams(params).toString()}`

const buildGroups = (suggestions: ISearchSuggestions): ISearchSuggestGroup[] => {
  const groups: ISearchSuggestGroup[] = []

  if (suggestions.categories.length > 0) {
    groups.push({
      title: 'Категории',
      items: suggestions.categories.map(category => ({
        id: `category:${category.slug}`,
        label: category.name,
        link: { href: catalogHref({ category: category.slug }) },
      })),
    })
  }

  if (suggestions.brands.length > 0) {
    groups.push({
      title: 'Бренды',
      items: suggestions.brands.map(brand => ({
        id: `brand:${brand}`,
        label: brand,
        link: { href: catalogHref({ brand }) },
      })),
    })
  }

  if (suggestions.products.length > 0) {
    groups.push({
      title: 'Товары',
      items: suggestions.products.map(product => ({
        id: `product:${product.id}`,
        label: product.name,
        hint: product.brand ?? undefined,
        link: { href: `/catalog/${product.slug}` },
        priceCents: product.priceCents,
        isPriceFrom: product.variantCount > 1,
        isUnavailable: !product.inStock,
        image:
          product.imageUrl === null
            ? undefined
            : { src: product.imageUrl, alt: product.imageAlt ?? product.name },
      })),
    })
  }

  return groups
}

export const CatalogSearch: React.FC = () => {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const pending = query.trim()
  const debounced = useDebouncedValue(query).trim()
  const isLongEnough = debounced.length >= SUGGEST_MIN_LENGTH

  /*
    `keepPreviousData` — не оптимизация, а лечение мигания: без него на каждый
    новый ключ SWR отдаёт `undefined`, `groups` становится `null`, и виджет
    снимает список целиком — то есть выдача гасла и въезжала заново на каждой
    паузе в наборе. Прошлые подсказки на полсекунды устаревшие, но это ровно то,
    на что человек смотрит, пока допечатывает.
  */
  const { data, isLoading } = useSWR(
    isLongEnough ? searchSuggestKey(debounced) : null,
    () => suggestSearch(debounced),
    { keepPreviousData: true }
  )

  /*
    Опустевшее поле сбрасывает выдачу само: `keepPreviousData` держит прошлый
    ответ и когда ключа больше нет, и без этой проверки стёртый запрос оставлял
    бы под шапкой подсказки к тому, чего в поле уже не написано.
  */
  const groups = useMemo(
    () => (!isLongEnough || data === undefined ? null : buildGroups(data)),
    [isLongEnough, data]
  )

  const submit = (): void => {
    if (pending === '') {
      return
    }

    setQuery('')
    void router.push(catalogHref({ q: pending }))
  }

  const select = (item: ISearchSuggestItem): void => {
    setQuery('')
    void router.push(item.link.href)
  }

  /*
    Переход состоялся — запрос своё отработал, поле пустеет. Именно по событию
    роутера, а не в `submit`/`select`: мышью строка открывается сама (это
    ссылка) и ни через один из них не проходит, а набранное так и оставалось
    висеть в шапке на следующей странице.
  */
  useEffect(() => {
    const clear = (): void => setQuery('')

    router.events.on('routeChangeComplete', clear)

    return () => {
      router.events.off('routeChangeComplete', clear)
    }
  }, [router.events])

  return (
    <HeaderSearch
      value={query}
      onChange={setQuery}
      groups={groups}
      /*
        «Показать всё» появляется только когда подсказки уже есть: строка,
        висящая в одиночестве над пустотой, — это не итог поиска, а его
        отсутствие, и говорить о нём должно «ничего не нашлось».
      */
      allResults={
        groups !== null && groups.length > 0
          ? {
              label: `Показать всё по запросу «${debounced}»`,
              link: { href: catalogHref({ q: debounced }) },
            }
          : undefined
      }
      /*
        Занятость — не только сам запрос: пока набранное не доехало до ключа
        (дебаунс), выдача на экране относится к прошлому запросу, и без
        спиннера эти полсекунды выглядят как «поиск не работает». Ровно та же
        связка, что в каталоге и в `useProductSearch`.
      */
      isBusy={pending.length >= SUGGEST_MIN_LENGTH && (pending !== debounced || isLoading)}
      maxLength={SUGGEST_MAX_LENGTH}
      /*
        Пустая выдача — тупик: дальше сайт человеку ничем не поможет, зато
        владелец в Instagram помочь может. Адрес тот же, что в подвале
        (`INSTAGRAM_URL`), — второго публичного контакта у магазина нет.
      */
      contact={{ label: 'Instagram', link: { href: INSTAGRAM_URL, target: '_blank' } }}
      /*
        И форма пожелания - под тем же «ничего не нашлось». Instagram рядом с
        ней не лишний: это разговор сейчас, а форма - строка в закупке через
        неделю, и человеку нужны оба.

        Тесная раскладка: внутри выпадающего списка своя карточка выглядела бы
        чужим блоком, случайно попавшим в подсказки.
      */
      emptyAction={<WantedProductPrompt isCompact={true} />}
      onSubmit={submit}
      onSelect={select}
    />
  )
}
