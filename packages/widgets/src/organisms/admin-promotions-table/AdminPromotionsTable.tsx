import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminPromotionsTableProps, IBasicStyling, IPromotion } from '../../types'
import { IconCopy, IconEye, IconEyeOff, IconPencil, IconTrash, IconUsers } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { IconButton } from '../../atoms/icon-button'
import { Skeleton } from '../../atoms/skeleton'
import { Tooltip } from '../../atoms/tooltip'
import { formatShortDate } from '../../utils/datetime'
import {
  PROMOTION_STATUS_LABELS,
  PROMOTION_STATUS_TONES,
  describeRewards,
} from '../../utils/promotion'
import * as styles from './AdminPromotionsTable.css'

/**
 * Список акций в админке.
 *
 * Настоящая `<table>` с заголовками колонок; ниже `xl` строки раскладываются в
 * карточки (миксин `styling/mixin/table.ts`) — на телефоне это основной вид, а
 * таблица добавляется шириной. Название колонки в карточке берётся из
 * `data-label`, роли проставлены явно: `display: block` снимает встроенные роли
 * таблицы, и без них строка перестала бы объявляться строкой.
 *
 * **Все действия строки — только иконки.** Каждая обёрнута в `Tooltip` с тем же
 * текстом, что и `aria-label` кнопки: подсказка скрыта от скринридера, поэтому
 * доступное имя несёт сама кнопка, а подсказка повторяет его для зрячих.
 * Тексты названы с акцией («Изменить «Весна»»): иконок столько же, сколько строк,
 * и безымянное «Изменить» скринридер читал бы у всех одинаково. Размер `lg`
 * (48px) — зона нажатия не меньше 44px на телефоне.
 *
 * «Изменить» и «Дублировать» — ссылки: это навигация, она открывается в новой
 * вкладке и остаётся в истории. Архивной акции вместо «Включить» и «Удалить»
 * нечего предложить: она уже в архиве, и её только смотрят или копируют.
 *
 * Статус считает бэкенд — по строке и по часам, не по флагу `isEnabled`.
 */

const DEFAULT_SKELETON_ROWS = 4
const COLUMN_COUNT = 6

const isArchived = (promotion: IPromotion): boolean => promotion.deletedAt !== null

interface IActionProps {
  label: string
  children: React.ReactNode
}

/** Иконка и подсказка с тем же текстом: подпись одна, чтобы не разойтись. */
const Action: FC<IActionProps> = ({ label, children }) => (
  <Tooltip content={label}>{children}</Tooltip>
)

export const AdminPromotionsTable: FC<IAdminPromotionsTableProps & IBasicStyling> = ({
  promotions,
  buildEditHref,
  buildDuplicateHref,
  onToggleEnabled,
  onShowParticipants,
  onDelete,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  busyId = null,
  emptyState,
  className,
}) => {
  if (!isLoading && promotions.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className={clsx(styles.wrap, className)}>
      <table className={styles.table} role="table">
        <thead className={styles.head} role="rowgroup">
          <tr className={styles.row} role="row">
            <th className={styles.headCell} scope="col" role="columnheader">
              Акция
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Период
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Статус
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Награды
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Участники
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
                    <Skeleton height={56} shape="block" />
                  </td>
                </tr>
              ))
            : promotions.map(promotion => {
                const archived = isArchived(promotion)
                const isBusy = busyId === promotion.id
                const name = `«${promotion.title}»`
                const toggleLabel = `${promotion.isEnabled ? 'Выключить' : 'Включить'} ${name}`
                const deleteLabel =
                  promotion.participantsCount > 0 ? `В архив ${name}` : `Удалить ${name}`

                return (
                  <tr
                    key={promotion.id}
                    role="row"
                    className={clsx(styles.row, archived && styles.archivedRow)}
                  >
                    <td className={styles.cell} role="cell">
                      <div className={styles.title}>
                        {/* `title` — длинное название обрезается многоточием, полный текст остаётся по наведению. */}
                        <AppLink
                          href={buildEditHref(promotion)}
                          className={styles.name}
                          title={promotion.title}
                        >
                          {promotion.title}
                        </AppLink>
                        <span className={styles.slug}>/{promotion.slug}</span>
                      </div>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Период">
                      <span className={styles.period}>
                        {formatShortDate(promotion.startsAt)} - {formatShortDate(promotion.endsAt)}
                      </span>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Статус">
                      {/* Слово и точка, а не один цвет: статус не должен читаться только по оттенку. */}
                      <Badge tone={PROMOTION_STATUS_TONES[promotion.status]} withDot={true}>
                        {PROMOTION_STATUS_LABELS[promotion.status]}
                      </Badge>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Награды">
                      <ul className={styles.rewards}>
                        {describeRewards(promotion.rewards).map((line, index) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <li key={index} className={styles.reward}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Участники">
                      <span className={styles.count}>{promotion.participantsCount}</span>
                    </td>

                    <td className={styles.actionsCell} role="cell">
                      <div className={styles.actions}>
                        <Action label={`Изменить ${name}`}>
                          <IconButton
                            icon={<IconPencil />}
                            label={`Изменить ${name}`}
                            size="lg"
                            variant="ghost"
                            link={{ href: buildEditHref(promotion) }}
                          />
                        </Action>

                        {!archived && (
                          <Action label={toggleLabel}>
                            <IconButton
                              icon={promotion.isEnabled ? <IconEyeOff /> : <IconEye />}
                              label={toggleLabel}
                              size="lg"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() => {
                                onToggleEnabled(promotion)
                              }}
                            />
                          </Action>
                        )}

                        <Action label={`Дублировать ${name}`}>
                          <IconButton
                            icon={<IconCopy />}
                            label={`Дублировать ${name}`}
                            size="lg"
                            variant="ghost"
                            link={{ href: buildDuplicateHref(promotion) }}
                          />
                        </Action>

                        <Action label={`Участники ${name}`}>
                          <IconButton
                            icon={<IconUsers />}
                            label={`Участники ${name}`}
                            size="lg"
                            variant="ghost"
                            onClick={() => {
                              onShowParticipants(promotion)
                            }}
                          />
                        </Action>

                        {!archived && (
                          <Action label={deleteLabel}>
                            <IconButton
                              icon={<IconTrash />}
                              label={deleteLabel}
                              size="lg"
                              variant="danger"
                              disabled={isBusy}
                              onClick={() => {
                                onDelete(promotion)
                              }}
                            />
                          </Action>
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
