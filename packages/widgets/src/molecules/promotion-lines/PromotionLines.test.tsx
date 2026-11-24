import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PromotionLines } from '.'
import { feedPromotionLines } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionLines', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromotionLines {...feedPromotionLines()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('discounts: строка на акцию со скидкой, сумма из ответа сервера', () => {
    renderWidget(<PromotionLines {...feedPromotionLines()} />)

    expect(screen.getByText('Акция «Весенняя распродажа»')).toBeInTheDocument()
    expect(screen.getByText(/^-.*сом$/)).toBeInTheDocument()
  })

  it('акция, давшая только подарок, строки скидки не получает', () => {
    const props = feedPromotionLines()
    const [applied] = props.promotions.applied

    renderWidget(
      <PromotionLines
        {...props}
        promotions={{ ...props.promotions, applied: [{ ...applied, discountCents: 0 }] }}
      />
    )

    expect(screen.queryByText('Акция «Весенняя распродажа»')).toBeNull()
  })

  it('промокод идёт отдельной строкой', () => {
    renderWidget(
      <PromotionLines
        {...feedPromotionLines()}
        code={{ code: 'K7M2XQ9R', discountCents: 30_000 }}
      />
    )

    expect(screen.getByText('Промокод K7M2XQ9R')).toBeInTheDocument()
  })

  it('hints: «Ещё N сом до акции» со ссылкой на страницу акции', () => {
    renderWidget(<PromotionLines {...feedPromotionLines()} kind="hints" />)

    expect(screen.getByText(/Ещё 1\s?200 сом до акции/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '«Подарок за большую заявку»' })).toHaveAttribute(
      'href',
      '/promotions/big-order'
    )
  })

  it('без подсказок и скидок ничего не рисует', () => {
    const props = feedPromotionLines()
    const empty = { ...props.promotions, applied: [], hints: [] }
    const { container } = renderWidget(<PromotionLines {...props} promotions={empty} />)

    expect(container.querySelector('ul')).toBeNull()
  })

  it('hints: недостающие сомы и штуки одной строкой', () => {
    const props = feedPromotionLines()
    const hint = { promotionId: 'p', slug: 's', title: 'Тройка' }

    renderWidget(
      <PromotionLines
        {...props}
        kind="hints"
        promotions={{
          ...props.promotions,
          hints: [
            { ...hint, promotionId: 'a', missingCents: 30_000, missingQuantity: 2 },
            { ...hint, promotionId: 'b', missingCents: 0, missingQuantity: 1 },
          ],
        }}
      />
    )

    expect(screen.getByText(/^Ещё 300.сом и 2 товара до акции/)).toBeInTheDocument()
    expect(screen.getByText(/^Ещё 1 товар до акции/)).toBeInTheDocument()
  })
})
