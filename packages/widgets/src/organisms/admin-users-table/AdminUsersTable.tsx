import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminUser, IAdminUsersTableProps, IBasicStyling, Role } from '../../types'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { Skeleton } from '../../atoms/skeleton'
import { VisuallyHidden } from '../../atoms/visually-hidden'
import { formatDate } from '../../utils/datetime'
import * as styles from './AdminUsersTable.css'

/**
 * Аккаунты магазина и их роли.
 *
 * Единственное действие здесь — выдать или снять доступ в админку: остального
 * про покупателя владельцу знать неоткуда и незачем, аккаунт заводит бот, а
 * телефон и имя человек меняет сам.
 *
 * Кто именно раздаёт доступ, решает `canManageRoles`: роли меняет только super
 * admin. Остальным таблица показывается без кнопок — обещать действие, на которое
 * бэкенд ответит `super_admin_only`, хуже, чем не обещать.
 *
 * Строку super admin не трогает никто, включая его самого: это тот единственный
 * доступ, который нельзя потерять, — иначе магазин остаётся без входа в
 * собственную панель, а обратно пускает только консоль сервера.
 *
 * Настоящая `<table>`, ниже `md` раскладывающаяся в карточки, — как в списке
 * товаров: подписи колонок берутся из `data-label`, роли проставлены явно.
 */

const DEFAULT_SKELETON_ROWS = 5

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  CUSTOMER: 'Покупатель',
}

const hasAdminAccess = (user: IAdminUser): boolean =>
  user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

export const AdminUsersTable: FC<IAdminUsersTableProps & IBasicStyling> = ({
  users,
  canManageRoles = false,
  onRoleChange,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  busyId = null,
  emptyState,
  className,
}) => {
  if (!isLoading && users.length === 0) {
    return <>{emptyState}</>
  }

  // Колонка действий не просто пустеет без права раздавать доступ, а исчезает:
  // пустой столбец с подписью «Доступ» читается как «кнопка не загрузилась».
  const columnCount = canManageRoles ? 5 : 4

  return (
    <div className={clsx(styles.wrap, className)}>
      <table className={styles.table} role="table">
        <thead className={styles.head} role="rowgroup">
          <tr className={styles.row} role="row">
            <th className={styles.headCell} scope="col" role="columnheader">
              Аккаунт
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Телефон
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Роль
            </th>
            <th className={styles.headCell} scope="col" role="columnheader">
              Регистрация
            </th>
            {canManageRoles && (
              <th className={styles.headActionsCell} scope="col" role="columnheader">
                Доступ
              </th>
            )}
          </tr>
        </thead>

        <tbody className={styles.body} role="rowgroup" aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: skeletonRows }, (_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index} className={styles.row} role="row">
                  <td className={styles.cell} role="cell" colSpan={columnCount}>
                    <Skeleton height={40} shape="block" />
                  </td>
                </tr>
              ))
            : users.map(user => {
                const admin = hasAdminAccess(user)
                const isOwner = user.role === 'SUPER_ADMIN'

                return (
                  <tr key={user.id} className={styles.row} role="row">
                    <td className={styles.cell} role="cell">
                      <span className={styles.name}>{user.name}</span>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Телефон">
                      {/* Ссылка `tel:` — с телефона владелец звонит отсюда же. */}
                      <a className={styles.phone} href={`tel:${user.phone}`}>
                        {user.phone}
                      </a>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Роль">
                      <Badge tone={admin ? 'brand' : 'neutral'} withDot={true}>
                        {ROLE_LABEL[user.role]}
                      </Badge>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Регистрация">
                      {formatDate(user.createdAt)}
                    </td>

                    {canManageRoles && (
                      <td className={styles.actionsCell} role="cell">
                        {/*
                          Подпись кнопки называет и человека: таких кнопок в таблице
                          столько же, сколько строк, и «Снять доступ» без имени
                          скринридер прочитал бы у всех одинаково.
                        */}
                        <Button
                          isFullWidth="mobile"
                          size="sm"
                          variant={admin ? 'secondary' : 'primary'}
                          disabled={busyId === user.id}
                          unavailableReason={isOwner ? 'Роль super admin не меняется' : null}
                          onClick={() => {
                            onRoleChange(user, admin ? 'CUSTOMER' : 'ADMIN')
                          }}
                        >
                          <span aria-hidden={true}>{admin ? 'Снять доступ' : 'Дать доступ'}</span>
                          <VisuallyHidden>
                            {admin
                              ? `Снять доступ в админку: ${user.name}`
                              : `Дать доступ в админку: ${user.name}`}
                          </VisuallyHidden>
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}
