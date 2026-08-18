import { describe, expect, it } from 'vitest'
import { DecorField } from '.'
import { feedDecorField } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Пятна — атмосфера, а не контент. Проверяется ровно то, из-за чего они
 * могли бы навредить: слышимость для скринридера, перехват кликов и
 * отсутствие явных размеров у картинки (то есть CLS).
 */
describe('DecorField', () => {
  it('прячет поле от скринридера и не ловит события', () => {
    const { container } = renderWidget(<DecorField {...feedDecorField()} />)
    const field = container.firstElementChild

    expect(field).toHaveAttribute('aria-hidden', 'true')
    expect(field?.querySelectorAll('a')).toHaveLength(0)
  })

  it('раскладывает пятна по переданным координатам', () => {
    const feed = feedDecorField()

    const { container } = renderWidget(<DecorField {...feed} />)
    const spots = container.querySelectorAll<HTMLElement>('[style*="top"]')

    expect(spots).toHaveLength(feed.spots.length)

    for (const [index, spot] of feed.spots.entries()) {
      expect(spots[index].style.top).toBe(spot.top)
      // Пятно прижато к своему краю положительным отступом — за край ему нельзя.
      expect(spots[index].style.getPropertyValue(spot.side)).toBe(spot.offsetX)
    }
  })

  /*
    Без `width`/`height` адаптер картинки уходит в режим `fill`, а страница
    получает скачок раскладки. Для декора это ошибка молчаливая — отсюда тест.
  */
  it('требует от картинок явных размеров', () => {
    const feed = feedDecorField()

    for (const spot of feed.spots) {
      expect(spot.image.width).toBeGreaterThan(0)
      expect(spot.image.height).toBeGreaterThan(0)
    }

    const { container } = renderWidget(<DecorField {...feed} />)

    for (const image of container.querySelectorAll('img')) {
      expect(image).toHaveAttribute('width')
      expect(image).toHaveAttribute('height')
      /* И грузятся лениво: за LCP отвечает заголовок героя, а не декор. */
      expect(image).toHaveAttribute('loading', 'lazy')
    }
  })
})
