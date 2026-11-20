import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PromoCarousel } from '.'
import { feedPromoCarousel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/*
  jsdom не раскладывает страницу и не знает `IntersectionObserver` и `scrollTo` у
  элементов: заводим минимум, чтобы проверить поведение - что видно, что нажимается
  и когда запускается автопрокрутка.
*/
const scrollTo = vi.fn()

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element): void {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        )
      }
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo
})

afterEach(() => {
  scrollTo.mockClear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('PromoCarousel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromoCarousel {...feedPromoCarousel()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('акция без мобильного баннера в карусель не попадает', () => {
    renderWidget(<PromoCarousel {...feedPromoCarousel()} />)

    expect(screen.getAllByRole('group')).toHaveLength(3)
    expect(screen.queryByRole('img', { name: 'Весенняя распродажа' })).not.toBeNull()
  })

  it('слайд - ссылка на страницу акции', () => {
    renderWidget(<PromoCarousel {...feedPromoCarousel()} />)

    expect(screen.getAllByRole('link', { hidden: true })[0]).toHaveAttribute(
      'href',
      '/promotions/spring-sale'
    )
  })

  it('десктопный баннер идёт через <picture> с брейкпоинта md, мобильный - по умолчанию', () => {
    const { container } = renderWidget(<PromoCarousel {...feedPromoCarousel()} />)
    const [first, second] = Array.from(container.querySelectorAll('picture'))

    expect(first?.querySelector('source')?.getAttribute('media')).toBe('(min-width: 768px)')
    expect(first?.querySelector('img')?.getAttribute('src')).toContain('1080')
    // У второго слайда десктопного баннера нет: только мобильный на всю ширину.
    expect(second?.querySelector('source')).toBeNull()
  })

  it('держит фиксированную пропорцию слайда, чтобы страница не прыгала', () => {
    const { container } = renderWidget(<PromoCarousel {...feedPromoCarousel()} />)
    const img = container.querySelector('img')

    expect(img).toHaveAttribute('width', '1080')
    expect(img).toHaveAttribute('height', '720')
  })

  it('точки листают на выбранный слайд', async () => {
    renderWidget(<PromoCarousel {...feedPromoCarousel()} />)

    await userEvent.click(screen.getByRole('button', { name: /Акция 2 из 3/ }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }))
  })

  it('автопрокрутка листает дальше по таймеру и встаёт на паузу под мышью', () => {
    vi.useFakeTimers()

    const { container } = renderWidget(<PromoCarousel {...feedPromoCarousel()} intervalMs={1000} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(scrollTo).toHaveBeenCalledTimes(1)

    const root = container.querySelector('section')

    scrollTo.mockClear()

    // Мышь над каруселью: следующий слайд сам не приходит.
    act(() => {
      root?.dispatchEvent(
        Object.assign(new Event('pointerover', { bubbles: true }), { pointerType: 'mouse' })
      )
    })
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('кнопка паузы останавливает автопрокрутку', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    renderWidget(<PromoCarousel {...feedPromoCarousel()} intervalMs={1000} />)
    await userEvent.click(screen.getByRole('button', { name: 'Остановить прокрутку акций' }))

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(scrollTo).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Запустить прокрутку акций' })).toBeInTheDocument()
  })

  it('одна акция - без точек и паузы', () => {
    renderWidget(
      <PromoCarousel
        {...feedPromoCarousel()}
        promotions={feedPromoCarousel().promotions.slice(0, 1)}
      />
    )

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('без подходящих акций ничего не рисует', () => {
    const { container } = renderWidget(<PromoCarousel {...feedPromoCarousel()} promotions={[]} />)

    expect(container.querySelector('section')).toBeNull()
  })
})
