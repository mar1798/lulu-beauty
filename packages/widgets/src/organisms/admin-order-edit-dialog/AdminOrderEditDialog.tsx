import clsx from 'clsx'
import { type FC } from 'react'
import type {
  IAdminOrderEditDialogProps,
  IAdminOrderEditLine,
  IBasicStyling,
  IItemRowItem,
  IOrderItem,
  OrderStatus,
} from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { ItemRow } from '../../molecules/item-row'
import { ITEM_FORMS } from '../../molecules/order-card'
import { orderStatusLabel } from '../../molecules/order-status-badge'
import { editedItemIds, formatDiscount, lostDiscounts } from '../../utils/discount'
import { pluralize } from '../../utils/plural'
import { adminOrderNumber } from '../admin-orders-table'
import { Modal } from '../modal'
import { ProductPicker } from '../product-picker'
import * as styles from './AdminOrderEditDialog.css'

/**
 * Админ меняет состав чужой заявки: убирает то, что не удалось достать,
 * добавляет то, что покупатель попросил в личке, правит количество.
 *
 * Правка собирается здесь же, в окне, и уходит одним запросом по
 * «Сохранить» — покупатель получает в боте одно сообщение с новым составом, а
 * не по сообщению на каждый клик.
 *
 * Статус от правки не меняется, и от покупателя ничего не ждут: ни нового
 * подтверждения, ни нового чека. Что это значит для заявки в её статусе,
 * сказано под шапкой — до «Сохранить», а не после.
 *
 * Бывшие в заявке строки держат цену снимка (по ней заявку взяли или
 * оплатили), новые встают по текущей цене каталога. Сумма до правки видна
 * рядом с новой, пока они расходятся.
 *
 * Пустой состав не сохранить: заявка без товаров — это отмена, и делается
 * она статусом.
 *
 * Скидки правка снимает так же, как правка покупателя: скидку на заявку — при
 * любом изменении, скидку строки — если строку убрали или поменяли количество.
 * Нетронутые строки свою сохраняют. Что снимется, окно говорит над итогом, а
 * страница переспрашивает перед сохранением. Итог складывается из того, что
 * прислал бэкенд: нетронутая строка стоит, сколько стоила со скидкой, остальные
 * — цена × количество. Своей арифметики скидок здесь нет.
 *
 * Клик мимо окна его не закрывает (`isDismissable={false}`): за ним правка.
 */

/** Что правка значит для заявки в этом статусе — одна строка под шапкой. */
const STATUS_NOTES: Partial<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT:
    'Счёт уже отправлен - покупатель получит новый состав и сумму, нового чека не ждём',
  CONFIRMED: 'Заявка оплачена - статус останется прежним, разницу в сумме решите с покупателем',
}

/** Строка в той форме, которую рисует `ItemRow`: категории тут не показываем. */
const asItem = (line: IAdminOrderEditLine): IItemRowItem => ({
  productName: line.productName,
  productImageUrl: line.productImageUrl,
  productPriceCents: line.priceCents,
  quantity: line.quantity,
  lineTotalCents: line.priceCents * line.quantity,
  productBrand: line.productBrand,
  productCategoryName: null,
  productVolumeMl: line.productVolumeMl,
  // Без тона две строки одной помады выглядели бы одинаково.
  productShade: line.productShade ?? null,
})

export const AdminOrderEditDialog: FC<IAdminOrderEditDialogProps & IBasicStyling> = ({
  isOpen,
  onClose,
  order,
  productSearch,
  lines,
  onAdd,
  onQuantityChange,
  onRemove,
  hasChanges,
  buildProductHref,
  isBusy = false,
  error = null,
  onSubmit,
  className,
}) => {
  const edited = order === null ? [] : editedItemIds(order, lines)

  /* Строка заявки, которую правка не тронула, — со своей скидкой и её суммой. */
  const untouched = (line: IAdminOrderEditLine): IOrderItem | undefined =>
    line.itemId === null || edited.includes(line.itemId)
      ? undefined
      : order?.items.find(item => item.id === line.itemId)

  const lost = order === null || !hasChanges ? [] : lostDiscounts(order, edited)
  const totalCents =
    order !== null && !hasChanges
      ? order.totalCents
      : lines.reduce((sum, line) => {
          const item = untouched(line)

          return (
            sum +
            (item?.lineTotalCents ?? line.priceCents * line.quantity) -
            (item?.discountCents ?? 0)
          )
        }, 0)
  const canSubmit = order !== null && lines.length > 0 && hasChanges

  const notes: string[] = []
  const statusNote = order === null ? undefined : STATUS_NOTES[order.status]

  if (statusNote !== undefined) {
    notes.push(statusNote)
  }

  if (order !== null && !order.canMessage) {
    notes.push('Покупатель не привязан к боту - сообщение об изменении ему не придёт')
  }

  return (
    <Modal
      className={clsx(styles.container, className)}
      isOpen={isOpen}
      onClose={onClose}
      title={order === null ? 'Изменить заявку' : `Изменить заявку № ${adminOrderNumber(order.id)}`}
      size="lg"
      isDismissable={false}
      footer={
        <>
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>
            Отменить
          </Button>
          <Button isLoading={isBusy} disabled={!canSubmit} onClick={onSubmit}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {order !== null && (
          <div className={styles.section}>
            <Text size="sm">
              <Text as="span" size="sm" weight="medium">
                {order.customerName}
              </Text>
              {` · ${orderStatusLabel(order.status)}`}
            </Text>

            {notes.map(text => (
              <Text key={text} size="sm" tone="muted">
                {text}
              </Text>
            ))}
          </div>
        )}

        <ProductPicker
          {...productSearch}
          addedVariantIds={lines.flatMap(line => (line.variantId === null ? [] : [line.variantId]))}
          addedLabel="Уже в заявке"
          onAdd={onAdd}
          isBusy={isBusy}
          label="Добавить товар"
          hint="Новый товар встанет в заявку по текущей цене каталога"
        />

        <div className={styles.section}>
          {lines.length > 0 ? (
            <div className={styles.items}>
              {lines.map(line => {
                const own = untouched(line)

                return (
                  <ItemRow
                    key={line.key}
                    item={asItem(line)}
                    discount={
                      own?.discountKind == null || own.discountValue === null
                        ? null
                        : {
                            cents: own.discountCents,
                            label: formatDiscount(own.discountKind, own.discountValue),
                            note: own.discountNote,
                          }
                    }
                    href={buildProductHref(line.productSlug)}
                    onQuantityChange={quantity => {
                      onQuantityChange(line.key, quantity)
                    }}
                    onRemove={() => {
                      onRemove(line.key)
                    }}
                    removeLabel={`Убрать из заявки: ${line.productName}`}
                    isBusy={isBusy}
                    isQuantityBusy={isBusy}
                  />
                )
              })}
            </div>
          ) : (
            <Alert tone="warning" title="В заявке не осталось товаров">
              Пустую заявку не сохранить - если она больше не нужна, отмените её статусом
            </Alert>
          )}

          {lost.length > 0 && (
            <Alert tone="warning" title={lost.length > 1 ? 'Скидки снимутся' : 'Скидка снимется'}>
              {`${lost.join(', ')} - ${lost.length > 1 ? 'они были даны' : 'она была дана'} на прежний состав. Покупатель увидит это в сообщении бота; если скидка остаётся в силе - дайте её заново после сохранения`}
            </Alert>
          )}

          {order?.discountKind != null && order.discountValue !== null && !hasChanges && (
            <Text size="sm" tone="muted">
              {`Скидка на заявку ${formatDiscount(order.discountKind, order.discountValue)}`}
            </Text>
          )}

          <div className={styles.totalRow}>
            <Text weight="medium">{`Итого · ${pluralize(lines.length, ITEM_FORMS)}`}</Text>
            <div className={styles.totals}>
              {order !== null && order.totalCents !== totalCents && (
                <Text size="sm" tone="muted">
                  {'Было '}
                  <Price priceCents={order.totalCents} size="sm" />
                </Text>
              )}
              <Price priceCents={totalCents} size="lg" />
            </div>
          </div>
        </div>

        {error !== null && (
          <Alert tone="danger" title="Изменения не сохранены">
            {error}
          </Alert>
        )}
      </div>
    </Modal>
  )
}
