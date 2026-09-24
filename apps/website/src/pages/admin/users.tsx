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
import { scrollToTop } from '@/utils/scroll'
import * as styles from '@/styles/admin.css'

/**
 * Аккаунты и доступ в админку.
 *
 * Админов в магазине может быть несколько: уведомления бота уходят каждому
 * (`telegram/recipients.get_owners`), а сид из `OWNER_*` заводит одного —
 * `SUPER_ADMIN`. Раздаёт и снимает доступ только он: остальные админы видят тот
 * же список, но без кнопок, и бэкенд отвечает им `super_admin_only`.
 *
 * Роль самого super admin не меняется ничем — ни из админки, ни им самим. Это и
 * есть гарантия, что магазин не останется без входа в собственную панель.
 *
 * Заводить аккаунты отсюда нельзя и не нужно: аккаунт создаёт бот, когда человек
 * делится номером. Здесь только роль.
 */

const PAGE_SIZE = 20

const SEARCH_DELAY_MS = 300

const AdminUsersPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const { isSuperAdmin } = useAuth()

  const [{ q: query, page }, setParams] = useQueryParams({ q: textParam, page: pageParam })

  // Как в списке товаров: набранное попадает в адрес, но «назад» не отматывает по букве.
  const commitSearch = useCallback(
    (next: string) => {
      setParams({ q: next, page: 1 }, { replace: true })
    },
    [setParams]
  )

  const [search, setSearch] = useQueryTextInput(query, commitSearch, SEARCH_DELAY_MS)

  /*
    Пагинация внизу таблицы: без прокрутки следующая страница начинается за
    верхним краем экрана, и владелец остаётся у кнопок, глядя на её хвост.
    Прокрутка своя, а не встроенная в переход (`scroll: false`), — иначе Next
    дёрнул бы страницу к началу мгновенно.
  */
  const goToPage = useCallback(
    (next: number) => {
      setParams({ page: next }, { scroll: false })
      scrollToTop()
    },
    [setParams]
  )

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  /*
    Запрос, по которому пришли строки, лежащие сейчас в `data`. `keepPreviousData`
    намеренно держит прошлую выдачу на экране при смене любого параметра, так что
    «данных по текущему ключу нет» (`isLoading`) не отличает поиск от перехода на
    другую страницу — а скелетон нужен только на поиске. Как в списке товаров.
  */
  const [loadedQuery, setLoadedQuery] = useState(query)

  const {
    data,
    error: fetchError,
    isLoading,
  } = useSWR(
    adminUsersKey(query, page),
    () => listAdminUsers({ q: query === '' ? undefined : query, page, pageSize: PAGE_SIZE }),
    // Смена страницы или запроса не должна ронять таблицу в скелетон.
    { keepPreviousData: true }
  )

  /*
    `isLoading` ложно ровно тогда, когда на экране выдача по текущему ключу.
    Правка состояния прямо в рендере — тот самый случай, ради которого React её
    допускает: значение целиком выводится из состояния загрузчика, и перерисовка
    случается сразу, до кадра, то есть скелетон не успевает мигнуть.
  */
  if (!isLoading && loadedQuery !== query) {
    setLoadedQuery(query)
  }

  /*
    Поиск идёт с первой буквы, а не с ухода запроса: дебаунс `useQueryTextInput`
    длится те же доли секунды, и всё это время в таблице лежит выдача по прошлому
    слову — а «Никого не нашлось» под недобранным именем читается как ответ.
    Отсюда две половины: `search !== query` — набранное ещё не доехало до адреса,
    `isLoading` при разошедшемся `loadedQuery` — запрос по новому слову в пути.
    Повтор того же слова SWR берёт из кеша, там `isLoading` ложно, и мигания не
    будет; смену страницы это тоже не задевает — `loadedQuery` уже совпадает.
  */
  const isSearching = search !== query || (isLoading && loadedQuery !== query)

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.users')

  const handleRoleChange = async (target: IAdminUser, role: Role): Promise<void> => {
    const isGranting = role === 'ADMIN'
    const confirmed = await confirm({
      title: isGranting ? 'Дать доступ в админку?' : 'Снять доступ в админку?',
      description: isGranting
        ? `${target.name} станет админом: сможет править каталог, сборы и заявки, а уведомления о новых заявках будут приходить и ему. Раздавать доступ останетесь только вы.`
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
      summary={
        isSuperAdmin
          ? 'Админов может быть несколько: каждый видит админку целиком и получает уведомления о заявках. Аккаунт заводит бот - здесь только роль.'
          : 'Кто имеет доступ к админке. Выдаёт и снимает его super admin магазина.'
      }
    >
      <div className={styles.stack}>
        {/*
          Спиннер на месте лупы — занятость видна там, куда человек печатает,
          ещё до того как таблица ниже встанет скелетоном.
        */}
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Поиск по имени или телефону"
          isBusy={isSearching}
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
        canManageRoles={isSuperAdmin}
        /*
          Скелетон — пока показывать нечего (первая загрузка) и на поиске: прошлые
          строки под новым словом читались бы как ответ на него. Голый `isLoading`
          из SWR сюда не годится — он истинен и на смене страницы, где
          `keepPreviousData` намеренно оставляет таблицу на экране.
        */
        isLoading={(data === undefined && error === null) || isSearching}
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
        <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={goToPage} />
      )}
    </AdminShell>
  )
}

export default AdminUsersPage
