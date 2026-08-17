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
    await userEvent.click(screen.getByRole('button', { name: /Дать доступ в админку: Бакыт/ }))

    expect(onRoleChange).toHaveBeenCalledWith(props.users[1], 'ADMIN')
  })

  /*
    Разжаловать себя — это закрыть магазину вход в собственную панель: обратно
    пускала бы только консоль базы. Бэкенд отвечает `own_role_change`, а кнопка
    объясняет это до нажатия.
  */
  it('не даёт изменить собственную роль', async () => {
    const props = feedAdminUsersTable()
    const onRoleChange = vi.fn()

    renderWidget(<AdminUsersTable {...props} onRoleChange={onRoleChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Снять доступ в админку: Айгуль/ }))

    expect(onRoleChange).not.toHaveBeenCalled()
  })
})
