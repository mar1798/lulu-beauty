import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminChecklistProps, IBasicStyling } from '../../types'
import { AppLink } from '../../atoms/app-link'
import { Checkbox } from '../../atoms/checkbox'
import { formatAmount, formatPrice } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { VisuallyHidden } from '../../atoms/visually-hidden'
import { formatVolume } from '../../utils/volume'
import * as styles from './AdminChecklist.css'

/**
 * Чек-лист закупки: что купить, сколько и почём — по строке на объём товара.
 *
 * Отметка красит строку светло-зелёным, и нажимать можно по всей строке, а не
 * только по квадратику: с телефона в магазине по нему не попасть с первого
 * раза. Сама отметка — настоящий `input type="checkbox"` в первой ячейке, он
 * и держит доступность и клавиатуру; щелчок по ячейке с ним до строки не
 * всплывает, иначе одно нажатие переключало бы отметку дважды.
 *
 * Где хранятся отметки, виджет не знает: `checkedKeys` и `onToggle` приходят
 * сверху.
 */

const DEFAULT_SKELETON_ROWS = 6

const COLUMN_COUNT = 4

const CENTS_IN_UNIT = 100

/**
 * Цена за штуку — в целых сомах: колонка рассчитана на шесть знаков
 * («99 999»), и копейки («12 500,50») раздвигали её за счёт названия товара.
 * Точную сумму показывает итог.
 */
const formatUnitPrice = (cents: number): string =>
  formatAmount(Math.round(cents / CENTS_IN_UNIT) * CENTS_IN_UNIT)

export const AdminChecklist: FC<IAdminChecklistProps & IBasicStyling> = ({
  items,
  checkedKeys,
  onToggle,
  buildProductHref,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  emptyState,
  className,
}) => {
  if (!isLoading && items.length === 0) {
    return <>{emptyState}</>
  }

  const checked = new Set(checkedKeys)
  // Отметки по строкам, которых в списке уже нет (заявку отменили), не считаются.
  const doneCount = items.filter(item => checked.has(item.key)).length
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)

  return (
    <div className={clsx(styles.wrap, className)}>
      {!isLoading && (
        <div className={styles.progress}>
          <span className={styles.progressLabel} aria-live="polite">
            Отмечено {doneCount} из {items.length}
          </span>
          <div className={styles.progressTrack} aria-hidden={true}>
            <div
              className={styles.progressFill}
              style={{ transform: `scaleX(${doneCount / items.length})` }}
            />
          </div>
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.headCell} scope="col">
              <VisuallyHidden>Куплено</VisuallyHidden>
            </th>
            <th className={styles.headCell} scope="col">
              Товар
            </th>
            {/*
              Подписи числовых колонок короткие и в одну строку: на телефоне
              ширина нужна названию товара. Полное название — для скринридера.
            */}
            <th className={styles.headNumberCell} scope="col">
              <span aria-hidden={true}>К</span>
              <VisuallyHidden>Количество</VisuallyHidden>
            </th>
            <th className={styles.headNumberCell} scope="col">
              <span aria-hidden={true}>За шт</span>
              <VisuallyHidden>Цена за штуку</VisuallyHidden>
            </th>
          </tr>
        </thead>

        <tbody aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: skeletonRows }, (_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index}>
                  <td className={styles.nameCell} colSpan={COLUMN_COUNT}>
                    <Skeleton height={40} shape="block" />
                  </td>
                </tr>
              ))
            : items.map(item => {
                const isChecked = checked.has(item.key)
                const volume = formatVolume(item.volumeMl)
                // «100 мл» не разрывается по строкам, как бы ни сжалась колонка.
                const volumeLabel = volume?.replace(' ', '\u00a0') ?? null
                const meta = [item.brand === '-' ? null : item.brand, volumeLabel]
                  .filter(Boolean)
                  .join(' · ')

                return (
                  <tr
                    key={item.key}
                    className={styles.row}
                    data-checked={isChecked}
                    onClick={() => {
                      onToggle(item.key, !isChecked)
                    }}
                  >
                    <td
                      className={styles.checkCell}
                      onClick={event => {
                        event.stopPropagation()
                      }}
                    >
                      <Checkbox
                        className={styles.checkbox}
                        checked={isChecked}
                        onChange={next => {
                          onToggle(item.key, next)
                        }}
                        label={
                          <VisuallyHidden>
                            {volume === null ? item.productName : `${item.productName}, ${volume}`}
                          </VisuallyHidden>
                        }
                      />
                    </td>

                    <td className={styles.nameCell}>
                      {/*
                        Переход по ссылке — не отметка: щелчок по ней до строки
                        не всплывает, иначе товар отмечался бы при каждом
                        заходе на его страницу.
                      */}
                      {item.productSlug === null ? (
                        <span className={styles.name}>{item.productName}</span>
                      ) : (
                        <span
                          className={styles.name}
                          onClick={event => {
                            event.stopPropagation()
                          }}
                        >
                          <AppLink
                            href={buildProductHref(item.productSlug)}
                            className={styles.nameLink}
                          >
                            {item.productName}
                          </AppLink>
                        </span>
                      )}
                      {meta !== '' && <span className={styles.meta}>{meta}</span>}
                    </td>

                    <td className={styles.numberCell}>
                      <span className={styles.quantity}>{item.quantity}</span>
                    </td>

                    {/*
                      Без «сом» в каждой ячейке: на телефоне ширина нужнее
                      названию товара. Валюта одна на магазин и стоит в итоге.
                    */}
                    <td className={styles.numberCell}>{formatUnitPrice(item.unitPriceCents)}</td>
                  </tr>
                )
              })}
        </tbody>

        {!isLoading && (
          <tfoot>
            {/*
              Одна ячейка на всю ширину, а не по колонкам: семизначный итог в
              колонке «За шт» раздувал её вдвое против самих цен, и место
              отнималось у названий товаров.
            */}
            <tr>
              <td className={styles.foot} colSpan={COLUMN_COUNT}>
                <span>Итого</span>
                <span className={styles.footTotals}>
                  {totalQuantity} шт · {formatPrice(totalCents)}
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
