import clsx from 'clsx'
import { type FC, type ReactNode } from 'react'
import type { IAdminPromoCode, IAdminPromoCodesTableProps, IBasicStyling } from '../../types'
import {
  IconClipboard,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
  IconUsers,
} from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { IconButton } from '../../atoms/icon-button'
import { ActionMenu } from '../../molecules/action-menu'
import { Skeleton } from '../../atoms/skeleton'
import { Tooltip } from '../../atoms/tooltip'
import { formatShortDate } from '../../utils/datetime'
import {
  ADMIN_PROMO_CODE_STATUS_LABELS,
  PROMOTION_STATUS_TONES,
  describeRewards,
} from '../../utils/promotion'
import * as styles from './AdminPromoCodesTable.css'

/**
 * Список промокодов владельца в админке.
 *
 * Устроен как `AdminPromotionsTable`: настоящая `<table>`, ниже `xl` строки
 * раскладываются в карточки, а действия строки собраны в меню «⋯»
 * (`ActionMenu`), чьё имя называет ещё и код. Число применений отдельной
 * колонкой не показывается - его видно в «Использованиях». Код стоит
 * отдельной колонкой с кнопкой «Скопировать»: его отправляют покупателю, и это
 * самое частое действие со строкой. Копирует страница (`onCopy`): виджет не
 * знает про буфер обмена и уведомления.
 *
 * «Кому»: «Все» у общего кода, имя и телефон у персонального. Если аккаунт
 * покупателя стёрт, вместо телефона - «Аккаунт удалён»: код уже никто не
 * применит. Персональный код с использованием помечен ещё и «Использован»:
 * он одноразовый, и это важнее, чем «Активен».
 *
 * Статус считает бэкенд, как у акций.
 */

const DEFAULT_SKELETON_ROWS = 4
const COLUMN_COUNT = 7

const isArchived = (promoCode: IAdminPromoCode): boolean => promoCode.deletedAt !== null

interface IActionProps {
  /** Действие без кода - текст подсказки. */
  label: string
  children: ReactNode
}

/** Иконка «Скопировать» и подсказка: подсказка называет действие, имя кнопки - ещё и код. */
const Action: FC<IActionProps> = ({ label, children }) => (
  <Tooltip content={label}>{children}</Tooltip>
)

export const AdminPromoCodesTable: FC<IAdminPromoCodesTableProps & IBasicStyling> = ({
  promoCodes,
  buildEditHref,
  buildDuplicateHref,
  onCopy,
  onToggleEnabled,
  onShowParticipants,
  onDelete,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  busyId = null,
  emptyState,
  className,
}) => {
  if (!isLoading && promoCodes.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className={clsx(styles.wrap, className)}>
      <table className={styles.table} role="table">
        <thead className={styles.head} role="rowgroup">
          <tr className={styles.row} role="row">
            <th className={styles.headCell} scope="col" role="columnheader">
              Код
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Название
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Кому
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Период
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Награды
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Статус
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
            : promoCodes.map(promoCode => {
                const archived = isArchived(promoCode)
                const isBusy = busyId === promoCode.id
                const name = `«${promoCode.code}»`
                const toggleAction = promoCode.isEnabled ? 'Выключить' : 'Включить'
                const deleteAction = promoCode.participantsCount > 0 ? 'В архив' : 'Удалить'
                const isPersonal = promoCode.assignedUser !== null
                const isSpent = isPersonal && promoCode.participantsCount > 0

                return (
                  <tr
                    key={promoCode.id}
                    role="row"
                    className={clsx(styles.row, archived && styles.archivedRow)}
                  >
                    <td className={styles.cell} role="cell" data-label="Код">
                      <div className={styles.codeCell}>
                        <AppLink href={buildEditHref(promoCode)} className={styles.code}>
                          {promoCode.code}
                        </AppLink>
                        <Action label="Скопировать код">
                          <IconButton
                            icon={<IconClipboard />}
                            label={`Скопировать код ${name}`}
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onCopy(promoCode)
                            }}
                          />
                        </Action>
                      </div>
                    </td>

                    <td className={styles.cell} role="cell">
                      <div className={styles.title}>
                        {/* `title` - длинное название обрезается многоточием, полный текст остаётся по наведению. */}
                        <AppLink
                          href={buildEditHref(promoCode)}
                          className={styles.name}
                          title={promoCode.title}
                        >
                          {promoCode.title}
                        </AppLink>
                      </div>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Кому">
                      {promoCode.assignedUser === null ? (
                        <span className={styles.period}>Все</span>
                      ) : (
                        <div className={styles.person}>
                          <span>{promoCode.assignedUser.name}</span>
                          <span className={styles.personPhone}>
                            {promoCode.assignedUser.isDeleted
                              ? 'Аккаунт удалён'
                              : promoCode.assignedUser.phone}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className={styles.cell} role="cell" data-label="Период">
                      <span className={styles.period}>
                        {promoCode.endsAt === null
                          ? `с ${formatShortDate(promoCode.startsAt)}, бессрочно`
                          : `${formatShortDate(promoCode.startsAt)} - ${formatShortDate(promoCode.endsAt)}`}
                      </span>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Награды">
                      <ul className={styles.rewards}>
                        {describeRewards(promoCode.rewards).map((line, index) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <li key={index} className={styles.reward}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Статус">
                      {/* Слово и точка, а не один цвет: статус не должен читаться только по оттенку. */}
                      <div className={styles.statuses}>
                        <Badge tone={PROMOTION_STATUS_TONES[promoCode.status]} withDot={true}>
                          {ADMIN_PROMO_CODE_STATUS_LABELS[promoCode.status]}
                        </Badge>
                        {isSpent && <Badge tone="neutral">Использован</Badge>}
                      </div>
                    </td>

                    <td className={styles.actionsCell} role="cell">
                      <ActionMenu
                        label={`Действия ${name}`}
                        items={[
                          {
                            label: 'Изменить',
                            icon: <IconPencil />,
                            link: { href: buildEditHref(promoCode) },
                          },
                          ...(archived
                            ? []
                            : [
                                {
                                  label: toggleAction,
                                  icon: promoCode.isEnabled ? <IconEyeOff /> : <IconEye />,
                                  disabled: isBusy,
                                  onSelect: () => {
                                    onToggleEnabled(promoCode)
                                  },
                                },
                              ]),
                          {
                            label: 'Дублировать',
                            icon: <IconCopy />,
                            link: { href: buildDuplicateHref(promoCode) },
                          },
                          {
                            label: 'Использования',
                            icon: <IconUsers />,
                            onSelect: () => {
                              onShowParticipants(promoCode)
                            },
                          },
                          ...(archived
                            ? []
                            : [
                                {
                                  label: deleteAction,
                                  icon: <IconTrash />,
                                  tone: 'danger' as const,
                                  disabled: isBusy,
                                  onSelect: () => {
                                    onDelete(promoCode)
                                  },
                                },
                              ]),
                        ]}
                      />
                    </td>
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}
