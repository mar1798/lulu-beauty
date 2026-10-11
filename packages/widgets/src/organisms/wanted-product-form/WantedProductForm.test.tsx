import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WantedProductForm } from '.'
import { feedWantedProductForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('WantedProductForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<WantedProductForm {...feedWantedProductForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('гостю вместо поля показывает вход', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    renderWidget(
      <WantedProductForm {...feedWantedProductForm()} isSignedIn={false} onSignIn={onSignIn} />
    )

    expect(screen.queryByLabelText('Что вы искали')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Отправить пожелание' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Войти через Telegram' }))

    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('гостю рядом со входом предлагает прямой контакт', () => {
    renderWidget(<WantedProductForm {...feedWantedProductForm()} isSignedIn={false} />)

    expect(screen.getByText(/Или напишите нам напрямую в/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Instagram' })).toBeInTheDocument()
  })

  it('у вошедшего не спрашивает ни имени, ни телефона', () => {
    renderWidget(<WantedProductForm {...feedWantedProductForm()} />)

    expect(screen.queryByLabelText('Как вас зовут')).toBeNull()
    expect(screen.queryByLabelText('Телефон')).toBeNull()
    expect(screen.getByLabelText('Что вы искали')).toBeInTheDocument()
  })

  it('в тесной раскладке поле остаётся именованным, а заголовка нет', () => {
    renderWidget(<WantedProductForm {...feedWantedProductForm()} isCompact={true} />)

    // Подписи нет - имя приходит из `aria-label`, иначе скринридер прочитал бы
    // «текстовое поле» и ничего больше.
    expect(screen.getByLabelText('Что вы искали')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('пустое пожелание наружу не уходит', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWidget(<WantedProductForm {...feedWantedProductForm()} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Отправить пожелание' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Напишите, что вы ищете')).toBeInTheDocument()
  })

  it('отдаёт обрезанный текст', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWidget(<WantedProductForm {...feedWantedProductForm()} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Что вы искали'), '  Тонер Anua  ')
    await user.click(screen.getByRole('button', { name: 'Отправить пожелание' }))

    expect(onSubmit).toHaveBeenCalledWith({ message: 'Тонер Anua' })
  })

  it('отправленная форма сменяется благодарностью', () => {
    renderWidget(<WantedProductForm {...feedWantedProductForm()} isSent={true} />)

    expect(screen.getByText('Спасибо, записали')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить пожелание' })).toBeNull()
  })
})
