import clsx from 'clsx'
import { type FC, useState } from 'react'
import type { IBasicStyling, IOrderDetailsProps } from '../../types'
import { formatDateTime } from '../../utils/datetime'
import { pluralize } from '../../utils/plural'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Divider } from '../../atoms/divider'
import { Heading } from '../../atoms/heading'
import { Price } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { ITEM_FORMS, orderNumber } from '../../molecules/order-card'
import { OrderItemRow } from '../../molecules/order-item-row'
import { OrderStatusBadge } from '../../molecules/order-status-badge'
import * as styles from './OrderDetails.css'

/**
 * Поданная заявка — со стороны покупателя.
 *
 * Правка доступна, пока сбор открыт и владелец не увёл заявку из «Ожидает
 * подтверждения»: это `order.isEditable`, считает его бэкенд. Одного флага
 * мало — нужны ещё обработчики: та же карточка без них рендерится в режиме
 * чтения. Позиции — снапшот цен на момент оформления, и правка количества
 * его не пересматривает.
 *
 * Комментарий правится отдельной кнопкой, а не по каждому нажатию клавиши:
 * иначе на каждую букву уходил бы PATCH.
 */

const NOTE_MAX_LENGTH = 2000

const DEFAULT_SKELETON_ROWS = 2

export const OrderDetails: FC<IOrderDetailsProps & IBasicStyling> = ({
  order,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  buildProductHref,
  isCurrentCycle = false,
  onItemQuantityChange,
  onItemRemove,
  onNoteSave,
  onCancel,
  isBusy = false,
  error = null,
  className,
}) => {
  const savedNote = order?.note ?? ''

  const [isEditingNote, setIsEditingNote] = useState(false)
  const [note, setNote] = useState(savedNote)

  const startEditingNote = (): void => {
    setNote(savedNote)
    setIsEditingNote(true)
  }

  const submitNote = (): void => {
    const trimmed = note.trim()
    onNoteSave?.(trimmed === '' ? null : trimmed)
    setIsEditingNote(false)
  }

  /*
    Скелетон повторяет раскладку карточки — шапка со статусом, позиции, итог.
    Хуки объявлены выше него намеренно: ранний возврат до `useState` менял бы
    их число между рендерами.
  */
  if (isLoading) {
    return (
      <div className={clsx(styles.container, className)} aria-busy={true}>
        {/*
          Ширины строк шапки — в пикселях, а не в процентах: `headMain`
          растягивается содержимым, а у скелетона содержимого нет, и от
          нулевой ширины родителя проценты дали бы нулевые же полоски.
        */}
        <div className={styles.head}>
          <div className={styles.headMain}>
            <Skeleton width={180} height={24} />
            <Skeleton width={220} height={14} />
          </div>

          <Skeleton shape="block" width={120} height={28} />
        </div>

        <Divider />

        <div className={styles.items}>
          {Array.from({ length: skeletonRows }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className={styles.skeletonRow}>
              <Skeleton shape="block" width={64} className={styles.skeletonThumb} />

              <div className={styles.skeletonLines}>
                <Skeleton width="55%" />
                <Skeleton width="30%" height={14} />
              </div>
            </div>
          ))}
        </div>

        <Skeleton width="40%" height={24} />
      </div>
    )
  }

  // Заявки нет и загрузка кончилась: что показать вместо неё, решает страница.
  if (order === null) {
    return null
  }

  const isEditable = order.isEditable && onItemQuantityChange !== undefined

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.head}>
        <div className={styles.headMain}>
          {/* h2: h1 страницы занят названием раздела в `AccountTemplate`. */}
          <Heading level={2} size="md">
            {`Заявка ${orderNumber(order.id)}`}
          </Heading>
          <Text size="sm" tone="muted">
            {`Оформлена ${formatDateTime(order.createdAt)}`}
          </Text>
        </div>

        <OrderStatusBadge status={order.status} />
      </div>

      {isEditable ? (
        <Text size="sm" tone="secondary">
          Состав можно поменять, пока сбор открыт и заявка не подтверждена. Цены остаются
          такими, какими были при оформлении.
        </Text>
      ) : (
        isCurrentCycle && (
          <Text size="sm" tone="secondary">
            Заявка относится к текущему сбору. Изменить её уже нельзя — напишите владельцу.
          </Text>
        )
      )}

      {error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )}

      {isEditingNote ? (
        <div className={styles.note}>
          <Textarea
            value={note}
            onChange={setNote}
            label="Комментарий к заявке"
            hint="Пожелания по составу, срокам или способу связи."
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            disabled={isBusy}
          />

          <div className={styles.noteActions}>
            <Button size="sm" onClick={submitNote} isLoading={isBusy}>
              Сохранить комментарий
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isBusy}
              onClick={() => {
                setIsEditingNote(false)
              }}
            >
              Отменить
            </Button>
          </div>
        </div>
      ) : (
        (savedNote !== '' || (isEditable && onNoteSave !== undefined)) && (
          <div className={styles.note}>
            <Text size="sm" weight="medium">
              Ваш комментарий
            </Text>
            <Text size="sm" tone={savedNote === '' ? 'muted' : 'secondary'}>
              {savedNote === '' ? 'Пока пусто' : savedNote}
            </Text>

            {isEditable && onNoteSave !== undefined && (
              <div className={styles.noteActions}>
                <Button size="sm" variant="ghost" disabled={isBusy} onClick={startEditingNote}>
                  {savedNote === '' ? 'Добавить комментарий' : 'Изменить комментарий'}
                </Button>
              </div>
            )}
          </div>
        )
      )}

      <Divider />

      <div className={styles.items}>
        {order.items.map(item => (
          <OrderItemRow
            key={item.id}
            item={item}
            href={item.productId === null ? null : buildProductHref(item.productSlug)}
            onQuantityChange={
              isEditable
                ? quantity => {
                    onItemQuantityChange?.(item.id, quantity)
                  }
                : undefined
            }
            onRemove={
              isEditable && onItemRemove !== undefined
                ? () => {
                    onItemRemove(item.id)
                  }
                : undefined
            }
            // Последнюю позицию бэкенд убрать не даст — для этого есть отмена заявки.
            canRemove={order.items.length > 1}
            isBusy={isBusy}
          />
        ))}
      </div>

      <div className={styles.totalRow}>
        <Text weight="medium">{`Итого · ${pluralize(order.items.length, ITEM_FORMS)}`}</Text>
        <Price priceCents={order.totalCents} size="lg" />
      </div>

      {isEditable && onCancel !== undefined && (
        <div className={styles.footer}>
          <Text size="sm" tone="muted">
            Отменённая заявка остаётся видна владельцу — он поймёт, что вы передумали.
          </Text>
          <Button variant="danger" disabled={isBusy} onClick={onCancel}>
            Отменить заявку
          </Button>
        </div>
      )}
    </div>
  )
}
