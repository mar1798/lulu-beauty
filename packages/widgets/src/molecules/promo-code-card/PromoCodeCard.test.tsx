import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromoCodeCard } from '.'
import { feedPromoCode, feedPromoCodeCard } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromoCodeCard', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromoCodeCard {...feedPromoCodeCard()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('показывает код, что он даёт, условия, срок и статус', () => {
    renderWidget(<PromoCodeCard {...feedPromoCodeCard()} />)

    expect(screen.getByText('K7M2XQ9R')).toBeInTheDocument()
    expect(screen.getByText('активен')).toBeInTheDocument()
    expect(screen.getByText('Скидка 15%')).toBeInTheDocument()
    expect(screen.getByText(/^от 2.000 сом$/)).toBeInTheDocument()
    expect(screen.getByText('Акция «Весенняя распродажа»')).toBeInTheDocument()
  })

  it('копирует код по кнопке', async () => {
    const onCopy = vi.fn()

    renderWidget(<PromoCodeCard {...feedPromoCodeCard()} onCopy={onCopy} />)
    await userEvent.click(screen.getByRole('button', { name: 'Скопировать код K7M2XQ9R' }))

    expect(onCopy).toHaveBeenCalledWith('K7M2XQ9R')
  })

  it('у недействующего кода нет копирования', () => {
    renderWidget(
      <PromoCodeCard {...feedPromoCodeCard()} code={feedPromoCode({ status: 'EXPIRED' })} />
    )

    expect(screen.getByText('истёк')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Скопировать/ })).toBeNull()
  })

  it('использованный код ведёт к заявке, которая его потратила', () => {
    renderWidget(
      <PromoCodeCard
        {...feedPromoCodeCard()}
        code={feedPromoCode({ status: 'USED', usedOrderId: 'order-9' })}
      />
    )

    expect(screen.getByText('использован')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Использован в заявке' })).toHaveAttribute(
      'href',
      '/orders/order-9'
    )
  })

  it('кнопки «Использовать» нет: код вводится на оформлении', () => {
    renderWidget(<PromoCodeCard {...feedPromoCodeCard()} />)

    expect(screen.queryByRole('link', { name: 'Использовать' })).toBeNull()
  })

  it('бессрочный код (expiresAt: null) показывает срок «с даты, бессрочно»', () => {
    renderWidget(
      <PromoCodeCard {...feedPromoCodeCard()} code={feedPromoCode({ expiresAt: null })} />
    )

    expect(screen.getByText(/, бессрочно$/)).toBeInTheDocument()
  })

  it('у персонального кода владельца название без «Акция», и видно описание', () => {
    renderWidget(
      <PromoCodeCard
        {...feedPromoCodeCard()}
        code={feedPromoCode({
          isOwnerCode: true,
          promotionTitle: 'Для постоянных',
          descriptionHtml: '<p>Спасибо, что с нами</p>',
        })}
      />
    )

    expect(screen.getByText('Для постоянных')).toBeInTheDocument()
    expect(screen.queryByText(/Акция «/)).toBeNull()
    expect(screen.getByText('Спасибо, что с нами')).toBeInTheDocument()
  })
})
