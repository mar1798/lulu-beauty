import clsx from 'clsx'
import { type FC, type ReactNode, useState } from 'react'
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
import { ItemRow } from '../../molecules/item-row'
import { OrderStatusBadge } from '../../molecules/order-status-badge'
import * as styles from './OrderDetails.css'

/**
 * Поданная заявка — со стороны покупателя.
 *
 * Правка доступна, пока сбор открыт и владелец не увёл заявку из «Ожидает
 * подтверждения»: это `order.isEditable`, считает его бэкенд. Одного флага
 * мало — нужны ещё обработчики: та же карточка без них рендерится в режиме
 * чтения. Цены позиций становятся снимком с момента подтверждения: пока
 * заявка ждёт его, каталожная переоценка протаскивается в неё бэкендом
 * (`OrderService.reprice_product`), а правка количества цену не трогает;
 * товар, добавленный позже (слот `addItem`), встаёт по цене на момент
 * добавления.
 *
 * Отмена — не точка: пока сбор открыт, её можно отозвать (`order.isRestorable`,
 * тот же дедлайн с другой стороны). Отменённая заявка сохраняет состав,
 * поэтому возврат ничего не пересобирает — он меняет только статус.
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
  addItem,
  onNoteSave,
  onCancel,
  onRestore,
  isBusy = false,
  busyItemId = null,
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
  const isRestorable = order.isRestorable && onRestore !== undefined

  /*
    Подпись под шапкой отвечает ровно на один вопрос: что с этой заявкой можно
    сделать сейчас. Поэтому ветки исключают друг друга, а не складываются —
    сказать отменённой заявке «изменить уже нельзя», когда её можно вернуть,
    значит закрыть человеку единственный оставшийся выход.
  */
  const notice = (): ReactNode => {
    if (isEditable) {
      return (
        <Text size="sm" tone="secondary">
          Состав можно поменять, пока сбор открыт и заявка не подтверждена. Цены пока
          не зафиксированы: они идут вслед за каталогом — окончательными они станут
          в момент подтверждения.
        </Text>
      )
    }

    if (isRestorable) {
      return (
        <Text size="sm" tone="secondary">
          Заявка отменена, но сбор ещё открыт — её можно вернуть тем же составом.
          Оформлять заново не нужно: она снова встанет в очередь на подтверждение,
          а цены до него идут вслед за каталогом.
        </Text>
      )
    }

    if (isCurrentCycle) {
      return (
        <Text size="sm" tone="secondary">
          Заявка относится к текущему сбору. Изменить её уже нельзя — напишите владельцу.
        </Text>
      )
    }

    return null
  }

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

      {notice()}

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
        {order.items.map(item => {
          const isRowBusy = isBusy && (busyItemId === null || busyItemId === item.id)

          return (
            <ItemRow
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
              removeLabel={`Убрать из заявки: ${item.productName}`}
              isBusy={isRowBusy}
              /*
                В заявке гаснет и количество: правка уходит на сервер как есть
                (в отличие от корзины, где она оптимистичная), и второе нажатие
                до ответа спорило бы с первым.
              */
              isQuantityBusy={isRowBusy}
            />
          )
        })}
      </div>

      {/*
        Добавление стоит между составом и итогом: это продолжение состава, и
        оно должно попасть в поле зрения раньше, чем сумма, которую поменяет.
      */}
      {isEditable && addItem}

      <div className={styles.totalRow}>
        <Text weight="medium">{`Итого · ${pluralize(order.items.length, ITEM_FORMS)}`}</Text>
        <Price priceCents={order.totalCents} size="lg" />
      </div>

      {isEditable && onCancel !== undefined && (
        <div className={styles.footer}>
          <Text size="sm" tone="muted">
            Отменённая заявка остаётся видна владельцу — он поймёт, что вы передумали.
            Передумать обратно можно, пока сбор открыт.
          </Text>
          <Button variant="danger" disabled={isBusy} onClick={onCancel}>
            Отменить заявку
          </Button>
        </div>
      )}

      {/*
        Возврат стоит на месте отмены и такой же кнопкой — это одно решение,
        просто повёрнутое обратно. Кнопка обычная, не `danger`: возвращать
        заявку не страшно, страшно было отменять.
      */}
      {isRestorable && (
        <div className={styles.footer}>
          <Text size="sm" tone="muted">
            Ничего не потеряно: состав и цены сохранены такими, какими были при оформлении.
          </Text>
          <Button disabled={isBusy} onClick={onRestore}>
            Вернуть заявку
          </Button>
        </div>
      )}
    </div>
  )
}
