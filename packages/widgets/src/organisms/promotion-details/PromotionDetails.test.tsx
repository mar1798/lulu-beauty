import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PromotionDetails } from '.'
import { feedPromotionDetails, feedPublicPromotion } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionDetails', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromotionDetails {...feedPromotionDetails()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('называет акцию, срок, условия и награды теми же словами, что админка', () => {
    renderWidget(<PromotionDetails {...feedPromotionDetails()} />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Весенняя распродажа' })
    ).toBeInTheDocument()
    expect(screen.getByText(/^Действует с/)).toBeInTheDocument()
    expect(screen.getByText(/^от 3.000 сом$/)).toBeInTheDocument()
    expect(screen.getByText('Скидка 10%')).toBeInTheDocument()
  })

  it('подарок идёт строкой с пометкой, а не пунктом списка', () => {
    renderWidget(<PromotionDetails {...feedPromotionDetails()} />)

    expect(screen.getByText('Подарок')).toBeInTheDocument()
    expect(screen.getByText('Mystery box')).toBeInTheDocument()
  })

  it('баннер: мобильный по умолчанию, десктопный с брейкпоинта md', () => {
    const { container } = renderWidget(<PromotionDetails {...feedPromotionDetails()} />)

    expect(container.querySelector('source')?.getAttribute('media')).toBe('(min-width: 768px)')
    expect(container.querySelector('img')).toHaveAttribute('width', '1080')
  })

  it('без баннера страница начинается с заголовка', () => {
    const { container } = renderWidget(
      <PromotionDetails
        {...feedPromotionDetails()}
        promotion={feedPublicPromotion({ bannerMobileUrl: null, bannerDesktopUrl: null })}
      />
    )

    expect(container.querySelector('picture')).toBeNull()
  })

  it('без условий говорит, что акция действует на любую заявку', () => {
    renderWidget(
      <PromotionDetails
        {...feedPromotionDetails()}
        promotion={feedPublicPromotion({ conditions: [] })}
      />
    )

    expect(screen.getByText(/действует на любую заявку/)).toBeInTheDocument()
  })

  it('про промокод-награду предупреждает, что он приходит после оплаты', () => {
    renderWidget(
      <PromotionDetails
        {...feedPromotionDetails()}
        promotion={feedPublicPromotion({
          rewards: [
            {
              type: 'PROMO_CODE',
              validDays: 30,
              validFrom: null,
              validUntil: null,
              conditions: [],
              rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 15, target: null }],
            },
          ],
        })}
      />
    )

    expect(screen.getByText(/Промокод приходит после оплаты заявки/)).toBeInTheDocument()
  })

  it('кнопка ведёт в каталог', () => {
    renderWidget(<PromotionDetails {...feedPromotionDetails()} />)

    expect(screen.getByRole('link', { name: 'Перейти в каталог' })).toHaveAttribute(
      'href',
      '/catalog'
    )
  })
})
