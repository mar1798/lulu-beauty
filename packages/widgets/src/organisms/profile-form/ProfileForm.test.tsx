import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileForm } from '.'
import { feedAuthUser, feedProfileForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Менять здесь можно имя и поля доставки. Проверяем именно это: телефон
 * остаётся нередактируемым, а кнопка не даёт отправить форму, пока ничего
 * не изменилось (иначе `PATCH /users/me` дёргался бы впустую).
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

  it('отдаёт поля очищенными так же, как их очистит бэкенд', async () => {
    const onSubmit = vi.fn()

    renderWidget(
      <ProfileForm
        user={feedAuthUser({ name: 'Айгуль', deliveryAddress: null, deliveryNote: 'Самовывоз' })}
        onSubmit={onSubmit}
      />
    )

    await userEvent.type(screen.getByLabelText(/Имя/), '  Асель  ')
    await userEvent.type(screen.getByLabelText(/Адрес доставки/), '  Бишкек, Киевская 10  ')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Айгуль Асель',
      deliveryAddress: 'Бишкек, Киевская 10',
      deliveryNote: 'Самовывоз',
    })
  })

  it('считает изменением правку одного только адреса', async () => {
    renderWidget(<ProfileForm user={feedAuthUser({ deliveryAddress: null })} onSubmit={vi.fn()} />)

    const submit = screen.getByRole('button', { name: 'Сохранить' })
    const address = screen.getByLabelText(/Адрес доставки/)

    // Пробелы в пустом поле — не изменение: незаполненное поле равно пустой строке.
    await userEvent.type(address, '   ')
    expect(submit).toBeDisabled()

    await userEvent.type(address, 'Ош')
    expect(submit).toBeEnabled()
  })

  it('отдаёт очищенное поле пустой строкой', async () => {
    const onSubmit = vi.fn()

    renderWidget(
      <ProfileForm
        user={feedAuthUser({ name: 'Айгуль', deliveryAddress: 'Бишкек', deliveryNote: null })}
        onSubmit={onSubmit}
      />
    )

    await userEvent.clear(screen.getByLabelText(/Адрес доставки/))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Айгуль',
      deliveryAddress: '',
      deliveryNote: '',
    })
  })

  it('не даёт править телефон', () => {
    renderWidget(<ProfileForm user={feedAuthUser()} onSubmit={vi.fn()} />)

    expect(screen.getByLabelText(/Телефон/)).toHaveAttribute('readonly')
  })

  it('после сохранения не остаётся «изменённой», даже если текст пришлось почистить', async () => {
    const before = feedAuthUser({ name: 'Айгуль', deliveryAddress: null, deliveryNote: null })
    const onSubmit = vi.fn()
    const { rerender } = renderWidget(<ProfileForm user={before} onSubmit={onSubmit} />)

    // Пробел перед переносом и пустая строка — то, что бэкенд вычистит.
    await userEvent.type(
      screen.getByLabelText(/Адрес доставки/),
      'Бишкек, Ленина 5 {Enter}{Enter}кв 3'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Айгуль',
      deliveryAddress: 'Бишкек, Ленина 5\nкв 3',
      deliveryNote: '',
    })

    // Сервер вернул очищенный адрес: форма с ним совпадает, подтверждение на виду.
    rerender(
      <ProfileForm
        user={{ ...before, deliveryAddress: 'Бишкек, Ленина 5\nкв 3' }}
        onSubmit={onSubmit}
        isSaved={true}
      />
    )

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
    expect(screen.getByText('Изменения сохранены.')).toBeInTheDocument()
  })
})
