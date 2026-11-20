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

  it('у недействующего кода нет ни копирования, ни «Использовать»', () => {
    renderWidget(
      <PromoCodeCard {...feedPromoCodeCard()} code={feedPromoCode({ status: 'EXPIRED' })} />
    )

    expect(screen.getByText('истёк')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Скопировать/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Использовать' })).toBeNull()
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

  it('«Использовать» ведёт на заданный адрес', () => {
    renderWidget(<PromoCodeCard {...feedPromoCodeCard()} />)

    expect(screen.getByRole('link', { name: 'Использовать' })).toHaveAttribute('href', '/cart')
  })
})
