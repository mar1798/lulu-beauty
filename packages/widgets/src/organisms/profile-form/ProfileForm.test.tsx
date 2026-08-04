import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileForm } from '.'
import { feedAuthUser, feedProfileForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Единственное, что здесь можно менять, — имя. Проверяем именно это:
 * телефон остаётся нередактируемым, а кнопка не даёт отправить форму,
 * пока имя не изменилось (иначе `PATCH /users/me` дёргался бы впустую).
 */
describe('ProfileForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ProfileForm {...feedProfileForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('держит «Сохранить» заблокированной, пока имя не изменили', async () => {
    const user = feedAuthUser({ name: 'Айгуль' })

    renderWidget(<ProfileForm user={user} onSubmit={vi.fn()} />)

    const submit = screen.getByRole('button', { name: 'Сохранить' })

    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Имя/), 'а')

    expect(submit).toBeEnabled()
  })

  it('отдаёт имя без крайних пробелов', async () => {
    const onSubmit = vi.fn()

    renderWidget(<ProfileForm user={feedAuthUser({ name: 'Айгуль' })} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/Имя/), '  Асель  ')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith('Айгуль  Асель')
  })

  it('не даёт править телефон', () => {
    renderWidget(<ProfileForm user={feedAuthUser()} onSubmit={vi.fn()} />)

    expect(screen.getByLabelText(/Телефон/)).toHaveAttribute('readonly')
  })
})
