import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type {
  IAdminOrder,
  IAdminOrderDialogProps,
  IAdminOrderDraftLine,
  ICustomerOption,
} from 'widgets/types'
import { useConfirm, useToast } from 'widgets/contexts'
import { useDebouncedValue } from 'widgets/hooks'
import { primaryImage } from 'widgets/molecules'
import { imagesForVariant } from 'widgets/utils'
import { adminOrderNumber } from 'widgets/organisms'
import { useProductSearch } from '@/hooks/useProductSearch'
import { isApiError, messageForError } from '@/services/apiErrors'
import { createAdminOrder, listAdminOrderCycles, listAdminUsers } from '@/services/endpoints/admin'
import {
  adminChecklistKey,
  adminCustomerSearchKey,
  adminOrderCyclesKey,
  isAdminOrderCyclesKey,
  isAdminOrdersKey,
  isAdminOverviewKey,
} from '@/services/swrKeys'

/**
 * Черновик заявки, которую админ оформляет за покупателя, — всё состояние окна
 * «Новая заявка» (`AdminOrderDialog`).
 *
 * Черновик живёт только здесь, на сервер уходит одним запросом по «Создать».
 * Закрыть окно с непустым черновиком можно только через подтверждение: за ним
 * выбранный покупатель и собранный состав, и промах мимо кнопки не должен их
 * выбрасывать.
 *
 * Сбор по умолчанию — первый из списка бэкенда (открытый, если он есть).
 * Выбор админа держится, пока сбор есть в списке; выпал — выбор сбрасывается,
 * а не подменяется умолчанием: тихо положить заявку не в тот сбор хуже, чем
 * попросить выбрать заново.
 *
 * У черновика свой `requestId`: повторная отправка того же черновика (двойной
 * клик, ответ не дошёл и админ нажал ещё раз) вернёт уже созданную заявку, а
 * не оформит вторую. Новый ключ — только с новым черновиком.
 */

/** Строк в выдаче поиска покупателя: дальше имя проще уточнить, чем листать. */
const CUSTOMER_RESULT_LIMIT = 8

/** Потолок количества — тот же, что у бэкенда (`MAX_ITEM_QUANTITY`). */
const MAX_QUANTITY = 999

interface IAdminOrderDraft {
  /** Пропсы окна целиком — страница только раскладывает их в `AdminOrderDialog`. */
  dialog: IAdminOrderDialogProps
  open: () => void
}

export const useAdminOrderDraft = (): IAdminOrderDraft => {
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const products = useProductSearch()

  const [isOpen, setIsOpen] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [customer, setCustomer] = useState<ICustomerOption | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [chosenCycleId, setChosenCycleId] = useState<string | null>(null)
  const [lines, setLines] = useState<IAdminOrderDraftLine[]>([])
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
    Поиск покупателя — по набранному, с тем же дебаунсом, что у товаров.
    `isSearching` считается от набранного, а не от запроса: иначе между
    последней буквой и уходом запроса показывать нечего (см. `useProductSearch`).
  */
  const pendingQuery = customerQuery.trim()
  const debouncedQuery = useDebouncedValue(customerQuery).trim()
  const customers = useSWR(
    isOpen && debouncedQuery !== '' ? adminCustomerSearchKey(debouncedQuery) : null,
    () =>
      listAdminUsers({ q: debouncedQuery, pageSize: CUSTOMER_RESULT_LIMIT }).then(
        page => page.items
      )
  )

  /*
    Сборы — с id покупателя: бэкенд заодно называет его открытые заявки в
    каждом. Прежний список держится на смене покупателя, чтобы выбор сбора не
    мигал скелетоном.
  */
  const cycles = useSWR(
    isOpen ? adminOrderCyclesKey(customer?.id ?? null) : null,
    () => listAdminOrderCycles(customer?.id),
    { keepPreviousData: true }
  )
  /*
    Пока список нового покупателя грузится, на экране прежний — и его
    `customerOrderIds` чужие: «уже есть заявка» назвало бы заявку другого
    человека. Сборы оставляем, заявки — нет, пока не придёт свой ответ.
  */
  const cycleList =
    cycles.data === undefined
      ? null
      : cycles.isLoading
        ? cycles.data.map(cycle => ({ ...cycle, customerOrderIds: [] }))
        : cycles.data

  const cycleId =
    cycleList === null
      ? null
      : chosenCycleId === null
        ? (cycleList[0]?.id ?? null)
        : cycleList.some(cycle => cycle.id === chosenCycleId)
          ? chosenCycleId
          : null

  const isDirty = customer !== null || lines.length > 0 || note.trim() !== ''

  const reset = (): void => {
    setCustomer(null)
    setCustomerQuery('')
    setChosenCycleId(null)
    setLines([])
    setNote('')
    setError(null)
    setRequestId(crypto.randomUUID())
    products.setQuery('')
  }

  const close = async (): Promise<void> => {
    if (isSubmitting) {
      return
    }

    if (isDirty) {
      const confirmed = await confirm({
        title: 'Отменить новую заявку?',
        description: 'Выбранный покупатель и товары не сохранятся',
        confirmLabel: 'Отменить заявку',
        cancelLabel: 'Вернуться',
        tone: 'danger',
      })

      if (!confirmed) {
        return
      }
    }

    setIsOpen(false)
    reset()
  }

  /** Товар из выдачи поиска — в черновик; уже добавленный объём прибавляется к своей строке. */
  const add = (variantId: string): void => {
    const product = products.products?.find(candidate =>
      candidate.variants.some(variant => variant.id === variantId)
    )
    const variant = product?.variants.find(candidate => candidate.id === variantId)

    if (product === undefined || variant === undefined) {
      return
    }

    setLines(current => {
      if (current.some(line => line.variantId === variantId)) {
        return current.map(line =>
          line.variantId === variantId
            ? { ...line, quantity: Math.min(line.quantity + 1, MAX_QUANTITY) }
            : line
        )
      }

      return [
        ...current,
        {
          variantId,
          productName: product.name,
          productSlug: product.slug,
          // Фото выбранного тона, как его снимет в заявку бэкенд (`variant_image`).
          productImageUrl:
            imagesForVariant(product.images, variant)[0]?.url ??
            primaryImage(product.images)?.url ??
            null,
          productBrand: product.brand,
          productVolumeMl: variant.volumeMl,
          productShade: variant.shade ?? null,
          priceCents: variant.priceCents,
          quantity: 1,
        },
      ]
    })
  }

  const setQuantity = (variantId: string, quantity: number): void => {
    setLines(current =>
      current.map(line =>
        line.variantId === variantId
          ? { ...line, quantity: Math.min(Math.max(quantity, 1), MAX_QUANTITY) }
          : line
      )
    )
  }

  const remove = (variantId: string): void => {
    setLines(current => current.filter(line => line.variantId !== variantId))
  }

  const announce = (order: IAdminOrder): void => {
    const cycle = cycleList?.find(candidate => candidate.id === order.cycleId)
    const where = cycle === undefined || cycle.label === null ? '' : `, сбор «${cycle.label}»`

    notify({
      tone: 'success',
      title: 'Заявка создана',
      description: `№ ${adminOrderNumber(order.id)} - ${order.customerName}${where}`,
    })
  }

  const submit = async (): Promise<void> => {
    if (customer === null || cycleId === null || lines.length === 0) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const order = await createAdminOrder({
        requestId,
        userId: customer.id,
        cycleId,
        items: lines.map(line => ({ variantId: line.variantId, quantity: line.quantity })),
        note: note.trim() === '' ? undefined : note.trim(),
      })

      announce(order)
      setIsOpen(false)
      reset()
      // Новая заявка меняет таблицу, счётчики сводки, лист закупки и «уже есть
      // заявка» у своего покупателя в следующем черновике.
      void globalMutate(isAdminOrdersKey)
      void globalMutate(isAdminOrderCyclesKey)
      void globalMutate(isAdminOverviewKey)
      void globalMutate(adminChecklistKey)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.order.create'))

      // Сбор выпал из окна, пока форма была открыта, — список надо перечитать.
      if (
        isApiError(cause) &&
        (cause.code === 'order_cycle_unavailable' || cause.code === 'no_cycle_for_order')
      ) {
        void cycles.mutate()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    open: () => {
      setIsOpen(true)
    },
    dialog: {
      isOpen,
      onClose: () => {
        void close()
      },
      customerSelect: {
        value: customer,
        onChange: next => {
          setCustomer(next)
          setError(null)
        },
        query: customerQuery,
        onQueryChange: setCustomerQuery,
        results: customers.data ?? null,
        isSearching:
          pendingQuery !== '' && (pendingQuery !== debouncedQuery || customers.isLoading),
        error:
          customers.error === undefined ? null : messageForError(customers.error, 'admin.users'),
      },
      productSearch: {
        query: products.query,
        onQueryChange: products.setQuery,
        products: products.products,
        isSearching: products.isSearching,
        error: products.error,
      },
      // Сбой загрузки — не «сборов нет»: список остаётся неизвестным, причина — в ошибке окна.
      cycles: cycleList,
      cycleId,
      onCycleChange: setChosenCycleId,
      lines,
      onAdd: add,
      onQuantityChange: setQuantity,
      onRemove: remove,
      note,
      onNoteChange: setNote,
      buildProductHref: slug => `/catalog/${slug}`,
      isBusy: isSubmitting,
      error:
        error ??
        (cycles.error === undefined ? null : messageForError(cycles.error, 'admin.order.create')),
      onSubmit: () => {
        void submit()
      },
    },
  }
}
