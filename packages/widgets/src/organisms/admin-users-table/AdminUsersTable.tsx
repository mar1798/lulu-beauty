import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminUser, IAdminUsersTableProps, IBasicStyling } from '../../types'
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
 * Свою строку тронуть нельзя (`currentUserId`): владелец, разжаловавший себя,
 * закрывает магазину вход в собственную панель, а обратно пускает только консоль
 * базы — бэкенд отвечает на такую попытку `own_role_change`.
 *
 * Настоящая `<table>`, ниже `md` раскладывающаяся в карточки, — как в списке
 * товаров: подписи колонок берутся из `data-label`, роли проставлены явно.
 */

const DEFAULT_SKELETON_ROWS = 5

const isAdmin = (user: IAdminUser): boolean => user.role === 'ADMIN'

export const AdminUsersTable: FC<IAdminUsersTableProps & IBasicStyling> = ({
  users,
  currentUserId,
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
            <th className={styles.headActionsCell} scope="col" role="columnheader">
              Доступ
            </th>
          </tr>
        </thead>

        <tbody className={styles.body} role="rowgroup" aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: skeletonRows }, (_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index} className={styles.row} role="row">
                  <td className={styles.cell} role="cell" colSpan={5}>
                    <Skeleton height={40} shape="block" />
                  </td>
                </tr>
              ))
            : users.map(user => {
                const admin = isAdmin(user)
                const isSelf = user.id === currentUserId

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
                        {admin ? 'Владелец' : 'Покупатель'}
                      </Badge>
                    </td>

                    <td className={styles.cell} role="cell" data-label="Регистрация">
                      {formatDate(user.createdAt)}
                    </td>

                    <td className={styles.actionsCell} role="cell">
                      {/*
                        Подпись кнопки называет и человека: таких кнопок в таблице
                        столько же, сколько строк, и «Снять доступ» без имени
                        скринридер прочитал бы у всех одинаково.
                      */}
                      <Button
                        size="sm"
                        variant={admin ? 'secondary' : 'primary'}
                        disabled={busyId === user.id}
                        unavailableReason={
                          isSelf ? 'Свою роль изменить нельзя — попросите другого владельца.' : null
                        }
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
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}
