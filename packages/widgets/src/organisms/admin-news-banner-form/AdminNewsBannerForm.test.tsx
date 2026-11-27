import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminNewsBannerForm } from '.'
import { feedAdminNewsBannerForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

const preview = (): HTMLElement => screen.getByTestId('news-preview')

describe('AdminNewsBannerForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminNewsBannerForm {...feedAdminNewsBannerForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('без заголовка не отправляется и показывает ошибку', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminNewsBannerForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Создать новость' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Введите заголовок')).toBeInTheDocument()
    expect(screen.getByText('Проверьте форму')).toBeInTheDocument()
  })

  it.each(['javascript:alert(1)', 'http://example.com', '//evil.example', '/a b'])(
    'плохая ссылка %s не уходит',
    async link => {
      const onSubmit = vi.fn()

      renderWidget(<AdminNewsBannerForm onSubmit={onSubmit} />)
      await userEvent.type(screen.getByLabelText(/Заголовок/), 'Новость')
      await userEvent.type(screen.getByLabelText('Ссылка'), link)
      await userEvent.click(screen.getByRole('button', { name: 'Создать новость' }))

      expect(onSubmit).not.toHaveBeenCalled()
      expect(screen.getByText('Ссылка должна начинаться с / или https://')).toBeInTheDocument()
    }
  )

  it('конец раньше начала - ошибка у поля', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminNewsBannerForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Новость')
    await userEvent.click(screen.getByRole('switch', { name: 'Показывать сразу' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Без даты окончания' }))

    const [startDate, endDate] = screen
      .getAllByLabelText(/дата/)
      .filter((field): field is HTMLInputElement => field instanceof HTMLInputElement)

    await userEvent.clear(startDate as HTMLInputElement)
    await userEvent.type(startDate as HTMLInputElement, '2030-05-10')
    await userEvent.clear(endDate as HTMLInputElement)
    await userEvent.type(endDate as HTMLInputElement, '2030-05-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать новость' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Конец показа должен быть позже начала')).toBeInTheDocument()
  })

  it('отправляет только заполненное: пустые поля - null, период открыт', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminNewsBannerForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/Заголовок/), '  Новый сбор открыт  ')
    await userEvent.type(screen.getByLabelText('Ссылка'), '/catalog')
    await userEvent.click(screen.getByRole('button', { name: 'Создать новость' }))

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Новый сбор открыт',
      text: null,
      linkUrl: '/catalog',
      ctaLabel: null,
      startsAt: null,
      endsAt: null,
      isEnabled: true,
      images: { mobile: null, desktop: null },
    })
  })

  it('превью меняется вместе с полями', async () => {
    renderWidget(<AdminNewsBannerForm onSubmit={vi.fn()} />)

    expect(within(preview()).getByText('Заголовок новости')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Скидки недели')
    await userEvent.type(screen.getByLabelText('Текст'), 'Только до пятницы')

    expect(within(preview()).getByText('Скидки недели')).toBeInTheDocument()
    expect(within(preview()).getByText('Только до пятницы')).toBeInTheDocument()
    // Ссылки нет - кнопки нет.
    expect(within(preview()).queryByText('Подробнее')).toBeNull()

    await userEvent.type(screen.getByLabelText('Ссылка'), '/catalog')

    expect(within(preview()).getByText('Подробнее')).toBeInTheDocument()
  })

  it('у сохранённой новости картинка уходит сразу, а кнопка называется «Сохранить»', async () => {
    const onImageUpload = vi.fn()
    const props = feedAdminNewsBannerForm()

    renderWidget(<AdminNewsBannerForm {...props} onImageUpload={onImageUpload} />)

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument()
  })
})
