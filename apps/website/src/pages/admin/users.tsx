import React, { useCallback, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminUser, Role } from 'widgets/types'
import { Alert } from 'widgets/atoms'
import { EmptyState, Pagination, SearchField } from 'widgets/molecules'
import { AdminUsersTable } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { useAuth } from '@/contexts/AuthContext'
import { pageParam, textParam, useQueryParams, useQueryTextInput } from '@/hooks/useQueryParams'
import { messageForError } from '@/services/apiErrors'
import { listAdminUsers, updateUserRole } from '@/services/endpoints/admin'
import { adminUsersKey, isAdminUsersKey } from '@/services/swrKeys'
import * as styles from '@/styles/admin.css'

/**
 * Аккаунты и доступ в админку.
 *
 * Владельцев в магазине может быть несколько: уведомления бота и так уходят
 * каждому `ADMIN` (`telegram/recipients.get_owners`), а сид из `OWNER_*` заводит
 * только первого — этой страницы не хватало, чтобы назначить второго, не открывая
 * консоль базы.
 *
 * Заводить аккаунты отсюда нельзя и не нужно: аккаунт создаёт бот, когда человек
 * делится номером. Здесь только роль.
 */

const PAGE_SIZE = 20

const SEARCH_DELAY_MS = 300

const AdminUsersPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()

  const [{ q: query, page }, setParams] = useQueryParams({ q: textParam, page: pageParam })

  // Как в списке товаров: набранное попадает в адрес, но «назад» не отматывает по букве.
  const commitSearch = useCallback(
    (next: string) => {
      setParams({ q: next, page: 1 }, { replace: true })
    },
    [setParams]
  )

  const [search, setSearch] = useQueryTextInput(query, commitSearch, SEARCH_DELAY_MS)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, error: fetchError } = useSWR(
    adminUsersKey(query, page),
    () => listAdminUsers({ q: query === '' ? undefined : query, page, pageSize: PAGE_SIZE }),
    // Смена страницы или запроса не должна ронять таблицу в скелетон.
    { keepPreviousData: true }
  )

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.users')

  const handleRoleChange = async (target: IAdminUser, role: Role): Promise<void> => {
    const isGranting = role === 'ADMIN'
    const confirmed = await confirm({
      title: isGranting ? 'Дать доступ в админку?' : 'Снять доступ в админку?',
      description: isGranting
        ? `${target.name} сможет всё то же, что и вы: править каталог, сборы и заявки. Уведомления о новых заявках будут приходить и ему.`
        : `${target.name} потеряет доступ к админке и уведомлениям о заявках. Аккаунт и его заявки останутся на месте.`,
      confirmLabel: isGranting ? 'Дать доступ' : 'Снять доступ',
    })

    if (!confirmed) {
      return
    }

    setBusyId(target.id)
    setActionError(null)

    try {
      await updateUserRole(target.id, role)
      notify({ tone: 'success', title: isGranting ? 'Доступ выдан' : 'Доступ снят' })
      // Все страницы списка, а не только текущая: бэкенд сортирует владельцев
      // первыми, так что изменённая строка уезжает на другую страницу — ровно то,
      // ради чего в swrKeys.ts заведён `isAdminUsersKey`.
      await globalMutate(isAdminUsersKey)
    } catch (cause: unknown) {
      const message = messageForError(cause, 'admin.users')

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminShell
      title="Доступ"
      summary="Владельцев может быть несколько: каждый видит админку целиком и получает уведомления о заявках. Аккаунт заводит бот — здесь только роль."
    >
      <div className={styles.stack}>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Поиск по имени или телефону"
        />
      </div>

      {error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )}

      {actionError !== null && (
        <Alert tone="danger" title="Не получилось">
          {actionError}
        </Alert>
      )}

      <AdminUsersTable
        users={data?.items ?? []}
        currentUserId={user?.id ?? null}
        // Скелетон — только пока показывать нечего: `isLoading` из SWR становится
        // истинным и на смене запроса, и таблица мигала бы на каждую букву.
        isLoading={data === undefined && error === null}
        busyId={busyId}
        onRoleChange={(target, role) => {
          void handleRoleChange(target, role)
        }}
        emptyState={
          <EmptyState
            title="Никого не нашлось"
            description="По этому запросу нет ни одного аккаунта. Попробуйте часть имени или номера."
          />
        }
      />

      {data !== undefined && data.total > PAGE_SIZE && (
        <Pagination
          page={page}
          total={data.total}
          pageSize={PAGE_SIZE}
          onChange={next => {
            setParams({ page: next })
          }}
        />
      )}
    </AdminShell>
  )
}

export default AdminUsersPage
