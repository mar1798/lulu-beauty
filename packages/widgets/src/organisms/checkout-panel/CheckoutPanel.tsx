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
 * Состав здесь только читается, а правится в корзине — по ссылке рядом с
 * заголовком. Степпер под кнопкой «Отправить заявку» превращал бы последний
 * экран в ещё одну корзину, а промах по `−` за секунду до отправки стоил бы
 * дороже лишнего перехода.
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
          Ссылка, а не кнопка: правка живёт в корзине целиком, и вести туда
          честнее, чем повторять её контролы на последнем шаге.
        */}
        <AppLink href={cartHref} className={styles.edit}>
          Изменить в корзине
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
                key={item.productId}
                item={item}
                href={buildProductHref(item.productSlug)}
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
