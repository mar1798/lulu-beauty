import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICheckoutPanelProps } from '../../types'
import { AppLink } from '../../atoms/app-link'
import { Heading } from '../../atoms/heading'
import { Skeleton } from '../../atoms/skeleton'
import { ItemRow } from '../../molecules/item-row'
import * as styles from './CheckoutPanel.css'

/**
 * Оформление: состав заявки слева, форма отправки справа.
 *
 * Количество правится на месте (`onQuantityChange`), а удаление остаётся в
 * корзине — по ссылке рядом с заголовком. Разделение не косметическое:
 * `−` промахивается в пределах одной позиции и виден по итогу, а крестик в
 * сантиметре от «Отправить заявку» уносит позицию целиком, и отменить это
 * нечем — undo в тостах нет. Заодно удаление последней позиции опустошило бы
 * корзину и подменило бы экран оформления пустым состоянием.
 *
 * Итог не дублируется: он в форме, вплотную к кнопке, — там, где на него
 * смотрят перед отправкой.
 *
 * Исключение из «правится в корзине» — дозаказ (слот `addItem`): забытое
 * вспоминают ровно здесь, на последнем экране, и отправлять за этим в каталог
 * значит терять собранную заявку из виду. Слот тот же `ProductPicker`, что и
 * в открытой заявке, — сценарий один, компонент один.
 */

const DEFAULT_SKELETON_ROWS = 2

export const CheckoutPanel: FC<ICheckoutPanelProps & IBasicStyling> = ({
  cart,
  buildProductHref,
  cartHref,
  form,
  addItem,
  onQuantityChange,
  isBusy = false,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  className,
}) => (
  <div className={clsx(styles.container, className)} aria-busy={isLoading || undefined}>
    <section className={styles.items}>
      <div className={styles.head}>
        <Heading level={2} size="md">
          Состав заявки
        </Heading>

        {/*
          Ссылка остаётся и при живых степперах: убрать позицию можно только
          там, и вести туда честнее, чем молчать о недостающем действии. Но
          называется она действием, а не фразой о нём («убрать товар можно в
          корзине»): ссылку и зачитывают как действие — «ссылка: вернуться
          в корзину».
        */}
        <AppLink href={cartHref} className={styles.edit}>
          {onQuantityChange === undefined ? 'Изменить в корзине' : 'Вернуться в корзину'}
        </AppLink>
      </div>

      <div className={styles.list}>
        {/*
          Скелетон повторяет геометрию `ItemRow` (миниатюра 64px и две
          строки текста): после ответа список не переставляет форму рядом.
        */}
        {isLoading || cart === null
          ? Array.from({ length: skeletonRows }, (_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={index} className={styles.skeletonRow}>
                {/* Ширина пропсом, а не классом: `Skeleton` ставит её инлайном. */}
                <Skeleton shape="block" width={64} className={styles.skeletonThumb} />

                <div className={styles.skeletonLines}>
                  <Skeleton width="60%" />
                  <Skeleton width="35%" height={14} />
                </div>
              </div>
            ))
          : cart.items.map(item => (
              <ItemRow
                key={item.variantId}
                item={item}
                href={buildProductHref(item.productSlug)}
                /*
                  `onRemove` не передаётся — вместе с ним `ItemRow` нарисовал бы
                  крестик, а удаление здесь не предусмотрено (см. докстринг).

                  Под собственный запрос количество не гаснет: оно меняется
                  оптимистично, запросы уходят по очереди, и быстрые нажатия
                  должны складываться. Замирает оно только под отправкой.
                */
                isQuantityBusy={isBusy}
                onQuantityChange={
                  onQuantityChange === undefined
                    ? undefined
                    : quantity => onQuantityChange(item.variantId, quantity)
                }
              />
            ))}
      </div>

      {/*
        Дозаказ идёт следом за составом, а не рядом с кнопкой отправки: это
        продолжение списка — «что ещё положить», — и попасть в поле зрения он
        должен раньше, чем итог, который поменяет.
      */}
      {!isLoading && cart !== null && addItem}
    </section>

    <div className={styles.form}>{form}</div>
  </div>
)
