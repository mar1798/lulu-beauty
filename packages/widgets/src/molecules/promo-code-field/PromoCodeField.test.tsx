import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromoCodeField } from '.'
import { feedPromoCodeField } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromoCodeField', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromoCodeField {...feedPromoCodeField()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('«Применить» заблокирована, пока поле пустое', () => {
    renderWidget(<PromoCodeField {...feedPromoCodeField()} />)

    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled()
  })

  it('применяет введённый код кнопкой и по Enter, не отправляя форму оформления', async () => {
    const onApply = vi.fn()

    renderWidget(<PromoCodeField {...feedPromoCodeField()} value="K7M2XQ9R" onApply={onApply} />)
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Промокод' }), '{Enter}')

    expect(onApply).toHaveBeenCalledTimes(2)
  })

  it('код из «Ваших промокодов» применяется одним нажатием', async () => {
    const onPickOption = vi.fn()

    renderWidget(<PromoCodeField {...feedPromoCodeField()} onPickOption={onPickOption} />)
    await userEvent.click(screen.getByRole('button', { name: /P4TN8W3B/ }))

    expect(onPickOption).toHaveBeenCalledWith('P4TN8W3B')
  })

  it('показывает ошибку проверки', () => {
    renderWidget(<PromoCodeField {...feedPromoCodeField()} error="Срок кода истёк" />)

    expect(screen.getByText('Срок кода истёк')).toBeInTheDocument()
  })

  it('принятый код заменяет поле строкой со скидкой и кнопкой «Убрать»', async () => {
    const onRemove = vi.fn()

    renderWidget(
      <PromoCodeField
        {...feedPromoCodeField()}
        onRemove={onRemove}
        applied={{ code: 'K7M2XQ9R', discountCents: 52_000, description: 'Скидка 15%' }}
      />
    )

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Промокод K7M2XQ9R')).toBeInTheDocument()
    expect(screen.getByText(/Скидка: -520 сом/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Убрать' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
