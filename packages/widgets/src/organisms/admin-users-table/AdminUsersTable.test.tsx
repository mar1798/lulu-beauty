import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminUsersTable } from '.'
import { feedAdminUsersTable } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AdminUsersTable', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminUsersTable {...feedAdminUsersTable()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('выдаёт доступ покупателю и снимает его у владельца', async () => {
    const props = feedAdminUsersTable()
    const onRoleChange = vi.fn()

    renderWidget(<AdminUsersTable {...props} onRoleChange={onRoleChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Дать доступ в админку: Чолпон/ }))
    await userEvent.click(screen.getByRole('button', { name: /Снять доступ в админку: Бакыт/ }))

    expect(onRoleChange).toHaveBeenNthCalledWith(1, props.users[2], 'ADMIN')
    expect(onRoleChange).toHaveBeenNthCalledWith(2, props.users[1], 'CUSTOMER')
  })

  /*
    Роль super admin не меняется ничем: это единственный доступ, потеря которого
    закрывает магазину вход в собственную панель. Бэкенд отвечает
    `super_admin_immutable`, а кнопка объясняет это до нажатия.
  */
  it('не даёт изменить роль super admin', async () => {
    const props = feedAdminUsersTable()
    const onRoleChange = vi.fn()

    renderWidget(<AdminUsersTable {...props} onRoleChange={onRoleChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Снять доступ в админку: Айгуль/ }))

    expect(onRoleChange).not.toHaveBeenCalled()
  })

  /*
    Обычный admin роли не раздаёт — у него это вообще не действие, а строка
    списка: кнопка, на которую бэкенд ответит `super_admin_only`, только злит.
  */
  it('без права раздавать доступ не показывает ни кнопок, ни колонки', () => {
    renderWidget(<AdminUsersTable {...feedAdminUsersTable()} canManageRoles={false} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('columnheader', { name: 'Доступ' })).toBeNull()
  })

  it('называет роли так же, как они называются в коде', () => {
    renderWidget(<AdminUsersTable {...feedAdminUsersTable()} />)

    expect(screen.getByText('Super admin')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
  })
})
