import { useEffect, useState } from 'react'
import type { IProduct } from 'widgets/types'
import { useDebouncedValue } from 'widgets/hooks'
import { isApiError } from '@/services/apiErrors'
import { listProducts } from '@/services/endpoints/catalog'

/**
 * Поиск товара по каталогу для подборщика (`ProductPicker`).
 *
 * Свежесть — по ключу-запросу, как в каталоге: ответ хранится вместе с
 * запросом, на который пришёл, поэтому отставший ответ не может перезаписать
 * актуальный, а «идёт поиск» — это просто «ответа на текущий запрос ещё нет».
 *
 * Товары не в наличии не отфильтровываются: `ProductPicker` показывает их
 * заблокированной строкой. «Ничего не нашлось» там, где товар есть, но
 * временно недоступен, читалось бы как дыра в каталоге.
 */

const RESULT_LIMIT = 5

const SEARCH_FAILED = 'Не удалось выполнить поиск.'

interface IProductSearch {
  query: string
  setQuery: (query: string) => void
  /** `null` — искать ещё не начинали или ответа на текущий запрос ещё нет. */
  products: IProduct[] | null
  isSearching: boolean
  error: string | null
}

interface ISettled {
  query: string
  products: IProduct[] | null
  error: string | null
}

export const useProductSearch = (limit: number = RESULT_LIMIT): IProductSearch => {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query).trim()

  const [settled, setSettled] = useState<ISettled | null>(null)

  useEffect(() => {
    if (debounced === '') {
      return
    }

    let isActive = true

    listProducts({ q: debounced, pageSize: limit })
      .then(page => {
        if (isActive) {
          setSettled({ query: debounced, products: page.items, error: null })
        }
      })
      .catch((cause: unknown) => {
        if (isActive) {
          setSettled({
            query: debounced,
            products: null,
            error: isApiError(cause) ? cause.message : SEARCH_FAILED,
          })
        }
      })

    return () => {
      isActive = false
    }
  }, [debounced, limit])

  const isFresh = settled !== null && settled.query === debounced && debounced !== ''

  return {
    query,
    setQuery,
    products: isFresh ? settled.products : null,
    isSearching: debounced !== '' && !isFresh,
    error: isFresh ? settled.error : null,
  }
}
