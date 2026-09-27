import clsx from 'clsx'
import { type FC, type ReactNode } from 'react'
import type {
  IAdminProductSort,
  IAdminProductSortField,
  IAdminProductsTableProps,
  IBasicStyling,
  IProduct,
  ISelectOption,
  ISortDirection,
} from '../../types'
import { IconBox, IconChevronDown, IconPencil, IconRestore, IconTrash } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { IconButton } from '../../atoms/icon-button'
import { Price } from '../../atoms/price'
import { Select } from '../../atoms/select'
import { Skeleton } from '../../atoms/skeleton'
import { primaryImage } from '../../molecules/product-card'
import { formatShortDate } from '../../utils/datetime'
import * as styles from './AdminProductsTable.css'

/**
 * Список товаров в админке.
 *
 * Настоящая `<table>` с заголовками колонок: скринридер объявляет ячейку
 * вместе с колонкой, и «Нет» в столбце «Наличие» остаётся понятным вне
 * визуального контекста.
 *
 * Ниже `xl` та же разметка раскладывается в карточки (см. миксин
 * `styling/mixin/table.ts`): название колонки берётся из `data-label`, а роли
 * проставлены явно — `display: block` снимает встроенные роли таблицы, и без
 * них строка перестала бы объявляться строкой.
 *
 * Удаление на бэкенде мягкое, поэтому удалённая строка не исчезает, а
 * помечается: у неё вместо корзины — восстановление. Отличить её можно
 * только по `deletedAt` — других признаков в ответе нет.
 *
 * Сортировка — щелчком по заголовку колонки, повторный щелчок разворачивает
 * порядок. На телефоне шапки нет, и то же состояние выбирается полем над
 * списком. Сами строки таблица не переставляет: порядок считает бэкенд, по
 * всему каталогу, а не по одной странице.
 */

const DEFAULT_SKELETON_ROWS = 5
const COLUMN_COUNT = 6

/**
 * С какого конца колонка начинает при первом щелчке: название и цена — с
 * начала алфавита и с дешёвых, дата — с новых, потому что старые товары
 * первыми ищут реже всего.
 */
const FIRST_DIRECTION: Record<IAdminProductSortField, ISortDirection> = {
  name: 'asc',
  price: 'asc',
  created: 'desc',
}

const nextSort = (current: IAdminProductSort, field: IAdminProductSortField): IAdminProductSort =>
  current.field === field
    ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { field, direction: FIRST_DIRECTION[field] }

/** Варианты поля на телефоне: колонка и направление сразу, словами. */
const MOBILE_SORT_OPTIONS: ISelectOption[] = [
  { value: 'created:desc', label: 'Сначала новые' },
  { value: 'created:asc', label: 'Сначала старые' },
  { value: 'name:asc', label: 'По названию, А-Я' },
  { value: 'name:desc', label: 'По названию, Я-А' },
  { value: 'price:asc', label: 'Сначала дешевле' },
  { value: 'price:desc', label: 'Сначала дороже' },
]

const sortValue = (sort: IAdminProductSort): string => `${sort.field}:${sort.direction}`

const parseSortValue = (value: string): IAdminProductSort | null => {
  const [field, direction] = value.split(':')
  const known = MOBILE_SORT_OPTIONS.some(option => option.value === value)

  return known ? ({ field, direction } as IAdminProductSort) : null
}

interface ISortableHeadProps {
  field: IAdminProductSortField
  sort: IAdminProductSort
  onSortChange: (sort: IAdminProductSort) => void
  children: ReactNode
}

/**
 * Заголовок сортируемой колонки. `aria-sort` стоит на самой `th` — там его
 * читает скринридер — и только у активной колонки: у остальных атрибута нет
 * вовсе, а не `none`, иначе про каждую колонку объявлялось бы «не отсортировано».
 */
const SortableHead: FC<ISortableHeadProps> = ({ field, sort, onSortChange, children }) => {
  const isActive = sort.field === field
  const isAscending = isActive && sort.direction === 'asc'

  return (
    <th
      className={styles.headCell}
      scope="col"
      role="columnheader"
      aria-sort={isActive ? (isAscending ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        className={clsx(styles.sortButton, isActive && styles.sortButtonActive)}
        onClick={() => {
          onSortChange(nextSort(sort, field))
        }}
      >
        {children}
        <IconChevronDown
          className={clsx(styles.sortIcon, isAscending && styles.sortIconAscending)}
        />
      </button>
    </th>
  )
}
const THUMB_SIZES = { fb: '56px' } as const

const isDeleted = (product: IProduct): boolean => product.deletedAt !== null

export const AdminProductsTable: FC<IAdminProductsTableProps & IBasicStyling> = ({
  products,
  sort,
  onSortChange,
  categoryNames,
  buildEditHref,
  onDelete,
  onRestore,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  busyId = null,
  emptyState,
  className,
}) => {
  if (!isLoading && products.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <>
      <Select
        className={styles.mobileSort}
        label="Сортировка"
        value={sortValue(sort)}
        options={MOBILE_SORT_OPTIONS}
        onChange={value => {
          const next = parseSortValue(value)

          if (next !== null) {
            onSortChange(next)
          }
        }}
      />

      <div className={clsx(styles.wrap, className)}>
        <table className={styles.table} role="table">
          <thead className={styles.head} role="rowgroup">
            <tr className={styles.row} role="row">
              <SortableHead field="name" sort={sort} onSortChange={onSortChange}>
                Товар
              </SortableHead>
              <th className={styles.headCell} scope="col" role="columnheader">
                Категория
              </th>
              <SortableHead field="price" sort={sort} onSortChange={onSortChange}>
                Цена
              </SortableHead>
              <SortableHead field="created" sort={sort} onSortChange={onSortChange}>
                Добавлен
              </SortableHead>
              <th className={styles.headCell} scope="col" role="columnheader">
                Наличие
              </th>
              <th className={styles.headActionsCell} scope="col" role="columnheader">
                Действия
              </th>
            </tr>
          </thead>

          <tbody className={styles.body} role="rowgroup" aria-busy={isLoading}>
            {isLoading
              ? Array.from({ length: skeletonRows }, (_, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={index} className={styles.row} role="row">
                    <td className={styles.cell} role="cell" colSpan={COLUMN_COUNT}>
                      <Skeleton height={40} shape="block" />
                    </td>
                  </tr>
                ))
              : products.map(product => {
                  const image = primaryImage(product.images)
                  const deleted = isDeleted(product)
                  const isBusy = busyId === product.id

                  return (
                    <tr
                      key={product.id}
                      role="row"
                      className={clsx(styles.row, deleted && styles.deletedRow)}
                    >
                      <td className={styles.cell} role="cell">
                        <div className={styles.product}>
                          <span className={styles.thumb}>
                            {image === null ? (
                              <IconBox className={styles.thumbIcon} />
                            ) : (
                              <AppImage
                                className={styles.thumbImage}
                                image={{ src: image.url, alt: image.alt ?? product.name }}
                                sizes={THUMB_SIZES}
                                fill={true}
                              />
                            )}
                          </span>

                          <span className={styles.productText}>
                            {/*
                            `title` — потому что длинное название обрезается
                            многоточием: полный текст должен оставаться
                            доступным хотя бы по наведению.
                          */}
                            <AppLink
                              href={buildEditHref(product)}
                              className={styles.name}
                              title={product.name}
                            >
                              {product.name}
                            </AppLink>
                            <span className={styles.slug}>/{product.slug}</span>
                          </span>
                        </div>
                      </td>

                      <td className={styles.cell} role="cell" data-label="Категория">
                        {product.categoryId === null
                          ? '-'
                          : (categoryNames[product.categoryId] ?? '-')}
                      </td>

                      <td className={styles.cell} role="cell" data-label="Цена">
                        {/*
                        «от» у товара в нескольких объёмах — то же, что на
                        витрине: в колонке стоит цена самого дешёвого, и без
                        оговорки владелец читал бы её как цену товара.
                      */}
                        <Price
                          priceCents={product.priceCents}
                          size="sm"
                          isFrom={product.variants.length > 1}
                        />
                      </td>

                      <td className={styles.cell} role="cell" data-label="Добавлен">
                        <span className={styles.date}>{formatShortDate(product.createdAt)}</span>
                      </td>

                      <td className={styles.cell} role="cell" data-label="Наличие">
                        {deleted ? (
                          <Badge tone="danger" withDot={true}>
                            Удалён
                          </Badge>
                        ) : (
                          /*
                          «Да»/«Нет», а не «В наличии»: колонка уже названа
                          «Наличие» (в карточном режиме — через `data-label`),
                          и полный текст только раздувал ячейку.
                        */
                          <Badge tone={product.inStock ? 'success' : 'neutral'} withDot={true}>
                            {product.inStock ? 'Да' : 'Нет'}
                          </Badge>
                        )}
                      </td>

                      <td className={styles.actionsCell} role="cell">
                        <div className={styles.actions}>
                          {/*
                          Переход на карточку — ссылка, а не кнопка: это
                          навигация, и она обязана открываться в новой вкладке
                          и попадать в историю. Подпись при этом скрытая, и
                          название товара в ней обязательно: в таблице таких
                          иконок столько же, сколько строк, и «Изменить» без
                          товара скринридер прочитал бы одинаково у всех.
                        */}
                          <IconButton
                            icon={<IconPencil />}
                            label={`Изменить «${product.name}»`}
                            size="sm"
                            variant="ghost"
                            link={{ href: buildEditHref(product) }}
                          />

                          {deleted ? (
                            <IconButton
                              icon={<IconRestore />}
                              label={`Восстановить «${product.name}»`}
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() => {
                                onRestore(product)
                              }}
                            />
                          ) : (
                            <IconButton
                              icon={<IconTrash />}
                              label={`Удалить «${product.name}»`}
                              size="sm"
                              variant="danger"
                              disabled={isBusy}
                              onClick={() => {
                                onDelete(product)
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
    </>
  )
}
