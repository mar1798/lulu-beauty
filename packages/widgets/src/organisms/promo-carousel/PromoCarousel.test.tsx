import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PromoCarousel } from '.'
import { feedBannerSlide, feedBannerSlides, feedNewsTextSlide } from '../../stories/feed'
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
    const { container } = renderWidget(<PromoCarousel slides={feedBannerSlides()} />)

    expect(container.firstElementChild).not.toBeNull()
    expect(screen.getAllByRole('group')).toHaveLength(4)
    expect(screen.getByRole('region', { name: 'Акции и новости' })).toBeInTheDocument()
  })

  it('картиночный слайд - ссылка на страницу акции', () => {
    renderWidget(<PromoCarousel slides={feedBannerSlides()} />)

    expect(screen.queryByRole('img', { name: 'Весенняя распродажа' })).not.toBeNull()
    expect(screen.getAllByRole('link', { hidden: true })[0]).toHaveAttribute(
      'href',
      '/promotions/spring-sale'
    )
  })

  it('текстовый слайд: заголовок, текст и подпись кнопки, картинки нет', () => {
    renderWidget(<PromoCarousel slides={[feedNewsTextSlide()]} />)

    expect(screen.getByText('Новый сбор открыт')).toBeInTheDocument()
    expect(screen.getByText(/Принимаем заявки/)).toBeInTheDocument()
    expect(screen.getByText('В каталог')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/catalog')
  })

  it('у текстового слайда без подписи кнопка называется «Подробнее»', () => {
    renderWidget(<PromoCarousel slides={[feedNewsTextSlide({ ctaLabel: null })]} />)

    expect(screen.getByText('Подробнее')).toBeInTheDocument()
  })

  it('слайд без ссылки - не <a> и без кнопки', () => {
    const { container } = renderWidget(
      <PromoCarousel slides={[feedNewsTextSlide({ href: null })]} />
    )

    expect(container.querySelector('a')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('В каталог')).toBeNull()
    expect(screen.getByText('Новый сбор открыт')).toBeInTheDocument()
  })

  it('внешняя ссылка открывается в новой вкладке с noopener noreferrer', () => {
    renderWidget(
      <PromoCarousel
        slides={[feedNewsTextSlide({ href: 'https://t.me/sululu', isExternal: true })]}
      />
    )

    const link = screen.getByRole('link')

    expect(link).toHaveAttribute('href', 'https://t.me/sululu')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('внутренняя ссылка остаётся в той же вкладке', () => {
    renderWidget(<PromoCarousel slides={[feedNewsTextSlide()]} />)

    const link = screen.getByRole('link')

    expect(link).not.toHaveAttribute('target')
    expect(link).not.toHaveAttribute('rel')
  })

  it('десктопный баннер идёт через <picture> с брейкпоинта md, мобильный - по умолчанию', () => {
    const { container } = renderWidget(<PromoCarousel slides={feedBannerSlides()} />)
    const [first, second] = Array.from(container.querySelectorAll('picture'))

    expect(first?.querySelector('source')?.getAttribute('media')).toBe('(min-width: 768px)')
    expect(first?.querySelector('img')?.getAttribute('src')).toContain('1080')
    // У второго слайда десктопного баннера нет: только мобильный на всю ширину.
    expect(second?.querySelector('source')).toBeNull()
  })

  it('держит фиксированную пропорцию слайда, чтобы страница не прыгала', () => {
    const { container } = renderWidget(<PromoCarousel slides={[feedBannerSlide()]} />)
    const img = container.querySelector('img')

    expect(img).toHaveAttribute('width', '1080')
    expect(img).toHaveAttribute('height', '720')
  })

  it('точки листают на выбранный слайд и называют слайд', async () => {
    renderWidget(<PromoCarousel slides={feedBannerSlides()} />)

    await userEvent.click(screen.getByRole('button', { name: /Слайд 2 из 4: Mystery box/ }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }))
  })

  it('автопрокрутка листает дальше по таймеру и встаёт на паузу под мышью', () => {
    vi.useFakeTimers()

    const { container } = renderWidget(
      <PromoCarousel slides={feedBannerSlides()} intervalMs={1000} />
    )

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

  it('кнопки паузы нет - карусель листается сама', () => {
    renderWidget(<PromoCarousel slides={feedBannerSlides()} />)

    expect(screen.queryByRole('button', { name: /прокрутку/ })).toBeNull()
  })

  it('один слайд - без точек', () => {
    renderWidget(<PromoCarousel slides={feedBannerSlides().slice(0, 1)} />)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('без слайдов ничего не рисует', () => {
    const { container } = renderWidget(<PromoCarousel slides={[]} />)

    expect(container.querySelector('section')).toBeNull()
  })
})
