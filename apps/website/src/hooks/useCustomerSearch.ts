import { useState } from 'react'
import useSWR from 'swr'
import type { ICustomerSelectProps } from 'widgets/types'
import { useDebouncedValue } from 'widgets/hooks'
import { messageForError } from '@/services/apiErrors'
import { listAdminUsers } from '@/services/endpoints/admin'
import { adminCustomerSearchKey } from '@/services/swrKeys'

/** Строк в выдаче поиска покупателя: дальше имя проще уточнить, чем листать. */
const CUSTOMER_RESULT_LIMIT = 8

interface ICustomerSearch {
  /** Всё, что `CustomerSelect` берёт от поиска; выбранного покупателя держит вызывающий. */
  props: Omit<ICustomerSelectProps, 'value' | 'onChange'>
  /** Очищает набранное - при закрытии окна или сбросе формы. */
  reset: () => void
}

/**
 * Поиск покупателя для `CustomerSelect`: окно «Новая заявка» и форма промокода.
 *
 * Поиск идёт по набранному, с тем же дебаунсом, что у товаров. `isSearching`
 * считается от набранного, а не от запроса: иначе между последней буквой и уходом
 * запроса показывать было бы нечего (см. `useProductSearch`). Запрос уходит, только
 * пока `isActive`: закрытое окно не должно ходить на сервер.
 */
export const useCustomerSearch = (isActive: boolean): ICustomerSearch => {
  const [query, setQuery] = useState('')

  const pendingQuery = query.trim()
  const debouncedQuery = useDebouncedValue(query).trim()
  const customers = useSWR(
    isActive && debouncedQuery !== '' ? adminCustomerSearchKey(debouncedQuery) : null,
    () =>
      listAdminUsers({ q: debouncedQuery, pageSize: CUSTOMER_RESULT_LIMIT }).then(
        page => page.items
      )
  )

  return {
    props: {
      query,
      onQueryChange: setQuery,
      results: customers.data ?? null,
      isSearching: pendingQuery !== '' && (pendingQuery !== debouncedQuery || customers.isLoading),
      error: customers.error === undefined ? null : messageForError(customers.error, 'admin.users'),
    },
    reset: () => {
      setQuery('')
    },
  }
}
