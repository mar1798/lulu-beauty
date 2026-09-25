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

  it('у гостя спрашивает имя и телефон', () => {
    renderWidget(<WantedProductForm {...feedWantedProductForm()} />)

    expect(screen.getByLabelText('Как вас зовут')).toBeInTheDocument()
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument()
  })

  it('у вошедшего покупателя остаётся одно поле', () => {
    renderWidget(<WantedProductForm {...feedWantedProductForm()} isSignedIn={true} />)

    expect(screen.queryByLabelText('Как вас зовут')).toBeNull()
    expect(screen.getByLabelText('Что вы искали')).toBeInTheDocument()
  })

  it('в тесной раскладке поле остаётся именованным, а заголовка нет', () => {
    renderWidget(
      <WantedProductForm {...feedWantedProductForm()} isCompact={true} isSignedIn={true} />
    )

    // Подписи нет - имя приходит из `aria-label`, иначе скринридер прочитал бы
    // «текстовое поле» и ничего больше.
    expect(screen.getByLabelText('Что вы искали')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('пустое пожелание наружу не уходит', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWidget(
      <WantedProductForm {...feedWantedProductForm()} isSignedIn={true} onSubmit={onSubmit} />
    )

    await user.click(screen.getByRole('button', { name: 'Отправить пожелание' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Напишите, что вы ищете')).toBeInTheDocument()
  })

  it('гостя без номера не выпускает', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWidget(<WantedProductForm {...feedWantedProductForm()} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Что вы искали'), 'Тонер Anua')
    await user.type(screen.getByLabelText('Как вас зовут'), 'Аня')
    await user.click(screen.getByRole('button', { name: 'Отправить пожелание' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите номер телефона')).toBeInTheDocument()
  })

  it('отдаёт телефон в E.164 и обрезанный текст', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWidget(<WantedProductForm {...feedWantedProductForm()} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Как вас зовут'), ' Аня ')
    await user.type(screen.getByLabelText('Телефон'), '555123456')
    await user.type(screen.getByLabelText('Что вы искали'), '  Тонер Anua  ')
    await user.click(screen.getByRole('button', { name: 'Отправить пожелание' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Аня',
      phone: '+996555123456',
      message: 'Тонер Anua',
    })
  })

  it('отправленная форма сменяется благодарностью', () => {
    renderWidget(<WantedProductForm {...feedWantedProductForm()} isSent={true} />)

    expect(screen.getByText('Спасибо, записали')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить пожелание' })).toBeNull()
  })
})
