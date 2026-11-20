import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GiftLine } from '.'
import { feedCartGift, feedGiftLine } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('GiftLine', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<GiftLine {...feedGiftLine()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('называет подарок, помечает его и показывает «Бесплатно» вместо цены', () => {
    renderWidget(<GiftLine {...feedGiftLine()} />)

    expect(screen.getByText('Подарок')).toBeInTheDocument()
    expect(screen.getByText('Mystery box')).toBeInTheDocument()
    expect(screen.getByText('Бесплатно')).toBeInTheDocument()
    expect(screen.getByText('Акция «Весенняя распродажа»')).toBeInTheDocument()
  })

  it('свободный подарок без картинки рисуется заглушкой, а не битым <img>', () => {
    const { container } = renderWidget(<GiftLine {...feedGiftLine()} />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('количество больше одного дописывается к названию', () => {
    renderWidget(<GiftLine gift={feedCartGift({ quantity: 3 })} />)

    expect(screen.getByText('Mystery box × 3')).toBeInTheDocument()
  })
})
