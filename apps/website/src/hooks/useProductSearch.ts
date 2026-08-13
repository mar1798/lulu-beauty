import { useState } from 'react'
import useSWR from 'swr'
import type { IProduct } from 'widgets/types'
import { useDebouncedValue } from 'widgets/hooks'
import { messageForError } from '@/services/apiErrors'
import { listProducts } from '@/services/endpoints/catalog'
import { productSearchKey } from '@/services/swrKeys'

/**
 * Поиск товара по каталогу для подборщика (`ProductPicker`).
 *
 * Ключ — запрос: повторный поиск того же текста берётся из кеша `useSWR`
 * мгновенно, без мигания.
 *
 * Товары не в наличии не отфильтровываются: `ProductPicker` показывает их
 * заблокированной строкой. «Ничего не нашлось» там, где товар есть, но
 * временно недоступен, читалось бы как дыра в каталоге.
 */

const RESULT_LIMIT = 5

interface IProductSearch {
  query: string
  setQuery: (query: string) => void
  /** `null` — искать ещё не начинали или ответа на текущий запрос ещё нет. */
  products: IProduct[] | null
  isSearching: boolean
  error: string | null
}

export const useProductSearch = (limit: number = RESULT_LIMIT): IProductSearch => {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query).trim()

  const {
    data,
    isLoading,
    error: fetchError,
  } = useSWR(debounced === '' ? null : productSearchKey(debounced, limit), () =>
    listProducts({ q: debounced, pageSize: limit }).then(page => page.items)
  )

  return {
    query,
    setQuery,
    products: data ?? null,
    isSearching: debounced !== '' && isLoading,
    error: fetchError === undefined ? null : messageForError(fetchError, 'catalog.search'),
  }
}
