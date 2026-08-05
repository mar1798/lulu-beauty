import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminProductsTableProps, IBasicStyling, IProduct } from '../../types'
import { IconBox, IconPencil, IconRestore, IconTrash } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
import { Price } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { primaryImage } from '../../molecules/product-card'
import * as styles from './AdminProductsTable.css'

/**
 * Список товаров в админке.
 *
 * Настоящая `<table>` с заголовками колонок: скринридер объявляет ячейку
 * вместе с колонкой, и «Нет» в столбце «Наличие» остаётся понятным вне
 * визуального контекста.
 *
 * Удаление на бэкенде мягкое, поэтому удалённая строка не исчезает, а
 * помечается: у неё вместо корзины — восстановление. Отличить её можно
 * только по `deletedAt` — других признаков в ответе нет.
 */

const DEFAULT_SKELETON_ROWS = 5
const THUMB_SIZES = { fb: '56px' } as const

const isDeleted = (product: IProduct): boolean => product.deletedAt !== null

export const AdminProductsTable: FC<IAdminProductsTableProps & IBasicStyling> = ({
  products,
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
    <div className={clsx(styles.wrap, className)}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.headCell} scope="col">
              Товар
            </th>
            <th className={styles.headCell} scope="col">
              Категория
            </th>
            <th className={styles.headCell} scope="col">
              Цена
            </th>
            <th className={styles.headCell} scope="col">
              Наличие
            </th>
            <th className={styles.headActionsCell} scope="col">
              Действия
            </th>
          </tr>
        </thead>

        <tbody aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: skeletonRows }, (_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index}>
                  <td className={styles.cell} colSpan={5}>
                    <Skeleton height={40} shape="block" />
                  </td>
                </tr>
              ))
            : products.map(product => {
                const image = primaryImage(product.images)
                const deleted = isDeleted(product)
                const isBusy = busyId === product.id

                return (
                  <tr key={product.id} className={clsx(deleted && styles.deletedRow)}>
                    <td className={styles.cell}>
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
                          <AppLink href={buildEditHref(product)} className={styles.name}>
                            {product.name}
                          </AppLink>
                          <span className={styles.slug}>/{product.slug}</span>
                        </span>
                      </div>
                    </td>

                    <td className={styles.cell}>
                      {product.categoryId === null
                        ? '—'
                        : (categoryNames[product.categoryId] ?? '—')}
                    </td>

                    <td className={styles.cell}>
                      <Price priceCents={product.priceCents} size="sm" />
                    </td>

                    <td className={styles.cell}>
                      {deleted ? (
                        <Badge tone="danger" withDot={true}>
                          Удалён
                        </Badge>
                      ) : (
                        <Badge tone={product.inStock ? 'success' : 'neutral'} withDot={true}>
                          {product.inStock ? 'В наличии' : 'Нет'}
                        </Badge>
                      )}
                    </td>

                    <td className={styles.actionsCell}>
                      <div className={styles.actions}>
                        {/*
                          Переход на карточку — ссылка, а не кнопка: это
                          навигация, и она обязана открываться в новой вкладке
                          и попадать в историю.
                        */}
                        <Button
                          variant="secondary"
                          size="sm"
                          link={{ href: buildEditHref(product) }}
                          iconStart={<IconPencil />}
                        >
                          Изменить
                        </Button>

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
  )
}
