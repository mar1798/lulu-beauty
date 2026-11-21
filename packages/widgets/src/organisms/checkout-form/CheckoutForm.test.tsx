import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CheckoutForm } from '.'
import { feedCheckoutForm, feedCheckoutFormWithPromotions } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CheckoutForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<CheckoutForm {...feedCheckoutForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('без акций нет ни «К оплате», ни строк скидок', () => {
    renderWidget(<CheckoutForm {...feedCheckoutForm()} />)

    expect(screen.queryByText('К оплате')).toBeNull()
  })

  it('со скидкой показывает строки акций и «К оплате» с сервера, поле кода - слотом', () => {
    renderWidget(
      <CheckoutForm {...feedCheckoutFormWithPromotions()} promoCode={<p>слот промокода</p>} />
    )

    expect(screen.getByText('Акция «Весенняя распродажа»')).toBeInTheDocument()
    expect(screen.getByText('К оплате')).toBeInTheDocument()
    expect(screen.getByText('слот промокода')).toBeInTheDocument()
  })

  it('строка промокода входит в скидки, когда код применён', () => {
    renderWidget(
      <CheckoutForm
        {...feedCheckoutFormWithPromotions()}
        code={{ code: 'K7M2XQ9R', discountCents: 20_000 }}
      />
    )

    expect(screen.getByText('Промокод K7M2XQ9R')).toBeInTheDocument()
  })
})
