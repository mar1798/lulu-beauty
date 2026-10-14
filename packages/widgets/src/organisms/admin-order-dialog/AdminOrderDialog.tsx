import clsx from 'clsx'
import { type FC, type ReactNode } from 'react'
import type {
  IAdminOrderCycle,
  IAdminOrderDialogProps,
  IAdminOrderDraftLine,
  IBasicStyling,
  IItemRowItem,
} from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Price } from '../../atoms/price'
import { Select } from '../../atoms/select'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { CustomerSelect } from '../../molecules/customer-select'
import { ItemRow } from '../../molecules/item-row'
import { ITEM_FORMS } from '../../molecules/order-card'
import { formatDate } from '../../utils/datetime'
import { pluralize } from '../../utils/plural'
import { adminOrderNumber } from '../admin-orders-table'
import { Modal } from '../modal'
import { ProductPicker } from '../product-picker'
import * as styles from './AdminOrderDialog.css'

/**
 * Заявка, которую админ оформляет за покупателя: опоздал к дедлайну, написал
 * в личку, а не на сайте.
 *
 * Сверху вниз — в том порядке, в каком решают: для кого, в какой сбор, что
 * положить. Состав собирается здесь же, в окне, и на сервер уходит одним
 * запросом по «Создать» — до этого никакой заявки нет, и закрыть окно значит
 * просто ничего не создать.
 *
 * Сбор выбирают, только когда есть из чего: открытый и закрытые не дольше
 * трёх дней назад. Вчерашний закрытый нужен ровно тогда, когда открылся уже
 * следующий, а закупка по вчерашнему ещё идёт, — опоздавший обычно должен
 * попасть именно в неё.
 *
 * Вторая заявка покупателя в том же сборе не запрещена, но о ней сказано:
 * чаще это ошибка, чем просьба.
 *
 * Клик мимо окна его не закрывает (`isDismissable={false}`): за ним собранный
 * черновик.
 */

/** Комментарий — тот же предел, что у покупательского (`note` на бэкенде). */
const NOTE_MAX_LENGTH = 2000

const cycleName = (cycle: IAdminOrderCycle): string => cycle.label ?? 'Без подписи'

/** Где сбор сейчас: открыт до дедлайна или закрыт — с какого числа. */
const cycleState = (cycle: IAdminOrderCycle): string =>
  cycle.isOpen
    ? `открыт до ${formatDate(cycle.deadlineAt)}`
    : `закрыт ${formatDate(cycle.closedAt ?? cycle.deadlineAt)}`

const cycleOption = (cycle: IAdminOrderCycle): string =>
  `${cycleName(cycle)} - ${cycleState(cycle)}`

/** Черновик в той форме, которую рисует `ItemRow`: категории тут не показываем. */
const asItem = (line: IAdminOrderDraftLine): IItemRowItem => ({
  productName: line.productName,
  productImageUrl: line.productImageUrl,
  productPriceCents: line.priceCents,
  quantity: line.quantity,
  lineTotalCents: line.priceCents * line.quantity,
  productBrand: line.productBrand,
  productCategoryName: null,
  productVolumeMl: line.productVolumeMl,
  // Без тона две строки одной помады в черновике выглядели бы одинаково.
  productShade: line.productShade ?? null,
})

export const AdminOrderDialog: FC<IAdminOrderDialogProps & IBasicStyling> = ({
  isOpen,
  onClose,
  customerSelect,
  productSearch,
  cycles,
  cycleId,
  onCycleChange,
  lines,
  onAdd,
  onQuantityChange,
  onRemove,
  note,
  onNoteChange,
  buildProductHref,
  isBusy = false,
  error = null,
  onSubmit,
  className,
}) => {
  const cycle = cycles?.find(candidate => candidate.id === cycleId) ?? null
  const customer = customerSelect.value
  const totalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)
  const canSubmit = customer !== null && cycle !== null && lines.length > 0

  const cycleBlock = (): ReactNode => {
    if (cycles === null) {
      return <Skeleton width="60%" />
    }

    if (cycles.length === 0) {
      return (
        <Alert tone="warning" title="Заявку некуда добавить">
          Открытого сбора нет, а последний закрылся больше трёх дней назад
        </Alert>
      )
    }

    if (cycles.length === 1 && cycle !== null) {
      return (
        <Text size="sm">
          {'Сбор: '}
          <Text as="span" size="sm" weight="medium">
            {cycleName(cycle)}
          </Text>
          {`, ${cycleState(cycle)}`}
        </Text>
      )
    }

    return (
      <Select
        label="Сбор"
        value={cycleId ?? ''}
        options={cycles.map(candidate => ({
          value: candidate.id,
          label: cycleOption(candidate),
        }))}
        disabled={isBusy}
        onChange={onCycleChange}
      />
    )
  }

  /*
    Что заявка значит для покупателя — зависит от сбора: в закрытом он её уже
    не поменяет, только отменит. Сказано заранее, чтобы это не стало
    сюрпризом после «Создать».
  */
  const cycleNotes: string[] = []

  if (cycle !== null && !cycle.isOpen) {
    cycleNotes.push('Сбор закрыт: покупатель сможет только отменить заявку, но не поменять состав')
  }

  if (customer !== null && !customer.telegramLinked) {
    cycleNotes.push('Покупатель не привязал чат с ботом - уведомление о заявке ему не придёт')
  }

  const existing = customer !== null && cycle !== null ? cycle.customerOrderIds : []

  return (
    <Modal
      className={clsx(styles.container, className)}
      isOpen={isOpen}
      onClose={onClose}
      title="Новая заявка"
      size="lg"
      isDismissable={false}
      footer={
        <>
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>
            Отменить
          </Button>
          <Button isLoading={isBusy} disabled={!canSubmit} onClick={onSubmit}>
            Создать заявку
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <CustomerSelect {...customerSelect} disabled={isBusy} />

        <div className={styles.section}>
          {cycleBlock()}

          {existing.length > 0 && (
            <Alert tone="info" title="У покупателя уже есть заявка в этом сборе">
              {`${existing.map(id => `№ ${adminOrderNumber(id)}`).join(', ')} - новая будет отдельной`}
            </Alert>
          )}

          {cycleNotes.map(text => (
            <Text key={text} size="sm" tone="muted">
              {text}
            </Text>
          ))}
        </div>

        <ProductPicker
          {...productSearch}
          addedVariantIds={lines.map(line => line.variantId)}
          addedLabel="Уже в заявке"
          onAdd={onAdd}
          isBusy={isBusy}
          label="Товары"
          hint="Товар встанет в заявку по текущей цене каталога"
        />

        {lines.length > 0 && (
          <div className={styles.section}>
            <div className={styles.items}>
              {lines.map(line => (
                <ItemRow
                  key={line.variantId}
                  item={asItem(line)}
                  href={buildProductHref(line.productSlug)}
                  onQuantityChange={quantity => {
                    onQuantityChange(line.variantId, quantity)
                  }}
                  onRemove={() => {
                    onRemove(line.variantId)
                  }}
                  removeLabel={`Убрать из заявки: ${line.productName}`}
                  isBusy={isBusy}
                  isQuantityBusy={isBusy}
                />
              ))}
            </div>

            <div className={styles.totalRow}>
              <Text weight="medium">{`Итого · ${pluralize(lines.length, ITEM_FORMS)}`}</Text>
              <Price priceCents={totalCents} size="lg" />
            </div>
          </div>
        )}

        <Textarea
          label="Комментарий"
          hint="Покупатель увидит его в заявке"
          value={note}
          onChange={onNoteChange}
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          disabled={isBusy}
        />

        {error !== null && (
          <Alert tone="danger" title="Заявка не создана">
            {error}
          </Alert>
        )}
      </div>
    </Modal>
  )
}
