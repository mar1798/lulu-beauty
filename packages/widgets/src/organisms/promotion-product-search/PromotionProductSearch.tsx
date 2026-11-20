import clsx from 'clsx'
import { type FC, useEffect, useState } from 'react'
import type { IBasicStyling, IProduct, IPromotionProductSearchProps } from '../../types'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { ProductPicker } from '../product-picker'
import * as styles from './PromotionProductSearch.css'

/**
 * Поиск товара для конструктора акций: цели скидок и условий, подарок-товар.
 *
 * Обёртка над `ProductPicker` (он целиком управляемый и сам ничего не ищет): тут
 * живёт набранное слово, дебаунс и ответ. Сам запрос делает страница — виджет
 * получает `searchProducts` и только ждёт промис, поэтому в нём нет ни одного
 * обращения к сети.
 *
 * Устаревший ответ отбрасывается: пока идёт запрос по прежнему слову, а человек
 * уже набрал другое, прежний результат не должен перекрыть новый.
 *
 * Строка в выдаче — вариант (объём или тон) товара, как в подборщике заявки:
 * подарком и целью бывает конкретный флакон, а не «сыворотка вообще».
 *
 * Уже выбранное помечено прямо в выдаче (`addedMode="selected"`): подсветка и
 * «Выбран» вместо кнопки. Цель акции хранит товары, поэтому у неё выбранными
 * становятся все объёмы товара (`pickedProductIds`).
 */

const DEBOUNCE_MS = 300

export const PromotionProductSearch: FC<IPromotionProductSearchProps & IBasicStyling> = ({
  searchProducts,
  onPick,
  pickedVariantIds = [],
  pickedProductIds = [],
  label = 'Найти товар',
  hint = 'Введите слово из названия товара',
  className,
}) => {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<IProduct[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS)

  useEffect(() => {
    if (debounced === '') {
      setProducts(null)
      setError(null)
      setIsLoading(false)

      return
    }

    let isStale = false

    setIsLoading(true)
    setError(null)

    searchProducts(debounced)
      .then(found => {
        if (!isStale) {
          setProducts(found)
        }
      })
      .catch(() => {
        if (!isStale) {
          setProducts(null)
          setError('Не удалось выполнить поиск. Попробуйте ещё раз.')
        }
      })
      .finally(() => {
        if (!isStale) {
          setIsLoading(false)
        }
      })

    return () => {
      isStale = true
    }
    // `searchProducts` намеренно вне зависимостей: страница может пересоздавать его на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const pickedVariants = [
    ...pickedVariantIds,
    ...(products ?? [])
      .filter(product => pickedProductIds.includes(product.id))
      .flatMap(product => product.variants.map(variant => variant.id)),
  ]

  return (
    <div className={clsx(styles.container, className)}>
      <ProductPicker
        query={query}
        onQueryChange={setQuery}
        products={products}
        // Скелетон стоит весь дебаунс — как у подборщика в заявке.
        isSearching={query.trim() !== '' && (debounced !== query.trim() || isLoading)}
        addedVariantIds={pickedVariants}
        addedMode="selected"
        label={label}
        hint={hint}
        error={error}
        onAdd={variantId => {
          const product = products?.find(candidate =>
            candidate.variants.some(variant => variant.id === variantId)
          )

          if (product !== undefined) {
            onPick(product, variantId)
          }
        }}
      />
    </div>
  )
}
