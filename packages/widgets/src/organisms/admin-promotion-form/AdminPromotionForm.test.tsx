import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromotionForm } from '.'
import { feedAdminPromotionForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('AdminPromotionForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminPromotionForm {...feedAdminPromotionForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('сохранённую акцию отправляет с её условиями и наградами', async () => {
    const onSubmit = vi.fn()
    const props = feedAdminPromotionForm()

    renderWidget(<AdminPromotionForm {...props} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledOnce()

    const values = onSubmit.mock.calls[0][0]

    expect(values.title).toBe('Весенняя распродажа')
    expect(values.conditions).toEqual([{ type: 'SUBTOTAL', minCents: 300_000, target: null }])
    expect(values.rewards).toHaveLength(2)
    expect(new Date(values.endsAt).getTime()).toBeGreaterThan(new Date(values.startsAt).getTime())
  })

  it('«Бессрочная» прячет конец и отправляет endsAt: null', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromotionForm {...feedAdminPromotionForm()} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('switch', { name: /Бессрочная/ }))

    expect(screen.queryByLabelText('Конец, дата')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ endsAt: null }))
  })

  it('бессрочная акция открывается с включённым переключателем', () => {
    const props = feedAdminPromotionForm()

    renderWidget(
      <AdminPromotionForm
        {...props}
        initialValues={props.initialValues && { ...props.initialValues, endsAt: null }}
      />
    )

    expect(screen.getByRole('switch', { name: /Бессрочная/ })).toBeChecked()
  })

  it('пустая форма создания не уходит: ошибки у полей', async () => {
    const onSubmit = vi.fn()

    renderWidget(
      <AdminPromotionForm
        {...feedAdminPromotionForm()}
        initialValues={undefined}
        savedBanners={undefined}
        onBannerUpload={undefined}
        onBannerRemove={undefined}
        onSubmit={onSubmit}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Создать акцию' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Введите название акции')).toBeInTheDocument()
    expect(screen.getByText('Добавьте хотя бы одну награду')).toBeInTheDocument()
  })

  it('slug подставляется из названия, пока его не правили руками', async () => {
    renderWidget(
      <AdminPromotionForm
        {...feedAdminPromotionForm()}
        initialValues={undefined}
        savedBanners={undefined}
        onBannerUpload={undefined}
        onBannerRemove={undefined}
      />
    )
    await userEvent.type(screen.getByLabelText(/^Название/), 'Весна')

    expect(screen.getByLabelText(/^Адрес/)).toHaveValue('vesna')
  })

  it('показывает рекомендованные размеры обоих баннеров', () => {
    renderWidget(<AdminPromotionForm {...feedAdminPromotionForm()} />)

    expect(screen.getAllByText(/Рекомендуем/).length).toBe(2)
  })

  it('конец раньше начала — ошибка у поля конца', async () => {
    const props = feedAdminPromotionForm()
    const onSubmit = vi.fn()

    renderWidget(<AdminPromotionForm {...props} onSubmit={onSubmit} />)

    const endDate = screen.getByLabelText(/^Конец, дата/)

    await userEvent.clear(endDate)
    await userEvent.type(endDate, '2000-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Акция должна заканчиваться позже, чем начинается')).toBeInTheDocument()
  })

  it('секции сворачиваются: открыта только «Основное», у остальных сводка', async () => {
    renderWidget(<AdminPromotionForm {...feedAdminPromotionForm()} />)

    const main = screen.getByRole('button', { name: /^Основное/ })
    const rewards = screen.getByRole('button', { name: /^Награды/ })

    expect(main).toHaveAttribute('aria-expanded', 'true')
    expect(rewards).toHaveAttribute('aria-expanded', 'false')
    expect(rewards).toHaveTextContent('2 награды')

    await userEvent.click(main)
    expect(main).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(rewards)
    expect(rewards).toHaveAttribute('aria-expanded', 'true')
  })

  it('ошибка в свёрнутой секции раскрывает её при отправке', async () => {
    renderWidget(
      <AdminPromotionForm
        {...feedAdminPromotionForm()}
        initialValues={undefined}
        savedBanners={undefined}
        onBannerUpload={undefined}
        onBannerRemove={undefined}
      />
    )

    const rewards = screen.getByRole('button', { name: /^Награды/ })

    expect(rewards).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Создать акцию' }))

    expect(rewards).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^Баннеры/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})
