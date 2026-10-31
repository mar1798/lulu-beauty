import { useState } from 'react'
import { mutate as globalMutate } from 'swr'
import type { IAdminOrder, IAdminOrderEditDialogProps, IAdminOrderEditLine } from 'widgets/types'
import { useConfirm, useToast } from 'widgets/contexts'
import { adminOrderNumber } from 'widgets/organisms'
import { useProductSearch } from '@/hooks/useProductSearch'
import { catalogLine, clampQuantity } from '@/utils/orderDraft'
import { isApiError, messageForError } from '@/services/apiErrors'
import { editAdminOrder } from '@/services/endpoints/admin'
import { adminChecklistKey, isAdminOrdersKey, isAdminOverviewKey } from '@/services/swrKeys'

/**
 * Правка состава чужой заявки из админки — всё состояние окна «Изменить
 * заявку» (`AdminOrderEditDialog`).
 *
 * Правка живёт только здесь и уходит одним запросом по «Сохранить»: бэкенд
 * принимает состав целиком, а покупатель получает одно сообщение с итогом.
 * Закрыть окно с несохранённой правкой можно только через подтверждение.
 *
 * Вместе с составом уходит `revision` заявки, с которой окно открыли: если
 * её успели поменять (покупатель, правка каталога, другой админ), бэкенд
 * откажет `order_changed`, а не перезапишет чужое изменение.
 */

interface IAdminOrderEdit {
  /** Пропсы окна целиком — страница только раскладывает их в `AdminOrderEditDialog`. */
  dialog: IAdminOrderEditDialogProps
  open: (order: IAdminOrder) => void
}

/** Строки заявки, как они есть, — исходная точка правки. */
const linesOf = (order: IAdminOrder): IAdminOrderEditLine[] =>
  order.items.map(item => ({
    key: item.id,
    itemId: item.id,
    variantId: item.variantId,
    productName: item.productName,
    productSlug: item.productSlug,
    productImageUrl: item.productImageUrl,
    productBrand: item.productBrand,
    productVolumeMl: item.productVolumeMl,
    productShade: item.productShade ?? null,
    priceCents: item.productPriceCents,
    quantity: item.quantity,
  }))

/** Отличается ли правка от заявки: новая строка, убранная или другое количество. */
const differs = (order: IAdminOrder, lines: IAdminOrderEditLine[]): boolean =>
  lines.length !== order.items.length ||
  lines.some(
    line =>
      line.itemId === null ||
      order.items.find(item => item.id === line.itemId)?.quantity !== line.quantity
  )

export const useAdminOrderEdit = (): IAdminOrderEdit => {
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const products = useProductSearch()

  const [isOpen, setIsOpen] = useState(false)
  const [order, setOrder] = useState<IAdminOrder | null>(null)
  const [lines, setLines] = useState<IAdminOrderEditLine[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasChanges = order !== null && differs(order, lines)

  const close = async (): Promise<void> => {
    if (isSubmitting) {
      return
    }

    if (hasChanges) {
      const confirmed = await confirm({
        title: 'Отменить изменения?',
        description: 'Новый состав заявки не сохранится',
        confirmLabel: 'Отменить изменения',
        cancelLabel: 'Вернуться',
        tone: 'danger',
      })

      if (!confirmed) {
        return
      }
    }

    // Заявку не сбрасываем: окно уезжает с анимацией, и шапка не должна мигнуть.
    setIsOpen(false)
  }

  /*
    Объём, который уже есть в заявке, прибавляется к своей строке — и к бывшей,
    и к добавленной сейчас: две строки одного объёма бэкенд всё равно слил бы.
    Убранную строку повторное добавление не воскрешает: объём встаёт новой
    строкой по цене каталога, как и на бэкенде.
  */
  const add = (variantId: string): void => {
    const line = catalogLine(products.products, variantId)

    if (line === null) {
      return
    }

    setLines(current =>
      current.some(existing => existing.variantId === variantId)
        ? current.map(existing =>
            existing.variantId === variantId
              ? { ...existing, quantity: clampQuantity(existing.quantity + 1) }
              : existing
          )
        : [...current, { ...line, key: variantId, itemId: null }]
    )
  }

  const setQuantity = (key: string, quantity: number): void => {
    setLines(current =>
      current.map(line =>
        line.key === key ? { ...line, quantity: clampQuantity(quantity) } : line
      )
    )
  }

  const remove = (key: string): void => {
    setLines(current => current.filter(line => line.key !== key))
  }

  const submit = async (): Promise<void> => {
    if (order === null || lines.length === 0 || !hasChanges) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const saved = await editAdminOrder(order.id, {
        revision: order.revision,
        items: lines.flatMap(line =>
          line.itemId === null ? [] : [{ itemId: line.itemId, quantity: line.quantity }]
        ),
        added: lines.flatMap(line =>
          line.itemId === null && line.variantId !== null
            ? [{ variantId: line.variantId, quantity: line.quantity }]
            : []
        ),
      })

      notify({
        tone: 'success',
        title: 'Состав изменён',
        description: `№ ${adminOrderNumber(saved.id)} - ${saved.customerName}`,
      })
      setOrder(saved)
      setIsOpen(false)
      // Состав меняет таблицу, счётчики сводки и лист закупки.
      void globalMutate(isAdminOrdersKey)
      void globalMutate(isAdminOverviewKey)
      void globalMutate(adminChecklistKey)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.order.edit'))

      // Заявка в таблице устарела: перечитываем, чтобы повторное открытие взяло свежую.
      if (
        isApiError(cause) &&
        (cause.code === 'order_changed' ||
          cause.code === 'order_not_editable' ||
          cause.code === 'order_item_not_found' ||
          cause.code === 'order_not_found')
      ) {
        void globalMutate(isAdminOrdersKey)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    open: next => {
      setOrder(next)
      setLines(linesOf(next))
      setError(null)
      products.setQuery('')
      setIsOpen(true)
    },
    dialog: {
      isOpen,
      onClose: () => {
        void close()
      },
      order,
      productSearch: {
        query: products.query,
        onQueryChange: products.setQuery,
        products: products.products,
        isSearching: products.isSearching,
        error: products.error,
      },
      lines,
      onAdd: add,
      onQuantityChange: setQuantity,
      onRemove: remove,
      hasChanges,
      buildProductHref: slug => `/catalog/${slug}`,
      isBusy: isSubmitting,
      error,
      onSubmit: () => {
        void submit()
      },
    },
  }
}
