import { describe, expect, it } from 'vitest'
import type { IAdminBannerItem, IBannerSlideDto } from 'widgets/types'
import {
  carouselLine,
  arrangedBy,
  replacedItem,
  shownSlides,
  toBannerSlide,
  toBannerSlides,
  withShown,
} from './banners'

const dto = (overrides: Partial<IBannerSlideDto> = {}): IBannerSlideDto => ({
  key: 'news:1',
  kind: 'NEWS',
  title: 'Новый сбор',
  text: 'Текст',
  imageMobileUrl: null,
  imageDesktopUrl: null,
  promotionSlug: null,
  linkUrl: null,
  ctaLabel: null,
  ...overrides,
})

describe('toBannerSlide', () => {
  it('акция ведёт на страницу акции', () => {
    expect(
      toBannerSlide(dto({ key: 'promotion:1', kind: 'PROMOTION', promotionSlug: 'spring-sale' }))
    ).toMatchObject({ href: '/promotions/spring-sale', isExternal: false })
  })

  it('новость с внутренней ссылкой остаётся на сайте', () => {
    expect(toBannerSlide(dto({ linkUrl: '/catalog?page=2' }))).toMatchObject({
      href: '/catalog?page=2',
      isExternal: false,
    })
  })

  it('внешняя ссылка помечена', () => {
    expect(toBannerSlide(dto({ linkUrl: 'https://t.me/sululu' }))).toMatchObject({
      href: 'https://t.me/sululu',
      isExternal: true,
    })
  })

  it('новость без ссылки - не ссылка', () => {
    expect(toBannerSlide(dto())).toMatchObject({ href: null, isExternal: false })
  })

  it('переносит тексты, картинки и подпись кнопки как есть', () => {
    expect(
      toBannerSlide(
        dto({
          imageMobileUrl: 'm.webp',
          imageDesktopUrl: 'd.webp',
          ctaLabel: 'В каталог',
          linkUrl: '/catalog',
        })
      )
    ).toEqual({
      key: 'news:1',
      kind: 'NEWS',
      title: 'Новый сбор',
      text: 'Текст',
      imageMobileUrl: 'm.webp',
      imageDesktopUrl: 'd.webp',
      href: '/catalog',
      isExternal: false,
      ctaLabel: 'В каталог',
    })
  })
})

describe('toBannerSlides', () => {
  it('сохраняет порядок ленты', () => {
    expect(
      toBannerSlides([dto({ key: 'news:b' }), dto({ key: 'news:a' })]).map(s => s.key)
    ).toEqual(['news:b', 'news:a'])
  })

  it('пустая лента - пустой список', () => {
    expect(toBannerSlides([])).toEqual([])
  })
})

describe('shownSlides', () => {
  it('берёт только то, что сейчас в карусели, в порядке списка', () => {
    const item = (key: string, state: IAdminBannerItem['state']): IAdminBannerItem =>
      ({ key, state, slide: dto({ key }) }) as IAdminBannerItem

    const items = [
      item('news:a', 'SHOWN'),
      item('promotion:b', 'HIDDEN'),
      item('promotion:c', 'SHOWN'),
      item('news:d', 'FINISHED'),
      item('promotion:e', 'NO_IMAGE'),
    ]

    expect(shownSlides(items).map(slide => slide.key)).toEqual(['news:a', 'promotion:c'])
  })
})

const row = (key: string, state: IAdminBannerItem['state'], isShown = true): IAdminBannerItem =>
  ({ key, state, isShown, position: null, slide: dto({ key }) }) as IAdminBannerItem

describe('withShown', () => {
  it('скрывает показанную и показывает скрытую', () => {
    expect(withShown(row('a', 'SHOWN'), false)).toMatchObject({ isShown: false, state: 'HIDDEN' })
    expect(withShown(row('a', 'HIDDEN', false), true)).toMatchObject({
      isShown: true,
      state: 'SHOWN',
    })
  })

  it('остальные состояния не трогает: выключенная акция остаётся выключенной', () => {
    expect(withShown(row('a', 'PROMOTION_OFF'), false)).toMatchObject({
      isShown: false,
      state: 'PROMOTION_OFF',
    })
    expect(withShown(row('a', 'SCHEDULED'), true).state).toBe('SCHEDULED')
  })
})

describe('arrangedBy', () => {
  it('ставит строки по порядку ключей и проставляет позиции', () => {
    const result = arrangedBy(
      [row('a', 'SHOWN'), row('b', 'SHOWN'), row('c', 'SHOWN')],
      ['c', 'a', 'b']
    )

    expect(result.map(item => [item.key, item.position])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ])
  })
})

describe('replacedItem', () => {
  it('подменяет только строку с тем же ключом', () => {
    const saved = row('b', 'HIDDEN', false)

    expect(replacedItem([row('a', 'SHOWN'), row('b', 'SHOWN')], saved)).toEqual([
      row('a', 'SHOWN'),
      saved,
    ])
  })
})

describe('carouselLine', () => {
  const base = { showInCarousel: true, bannerMobileUrl: '/m.jpg', status: 'ACTIVE' as const }

  it('says shown only when chosen, with a mobile banner and running', () => {
    expect(carouselLine(base)).toBe('Карусель: показывается')
  })

  it('says why the slide is not there', () => {
    expect(carouselLine({ ...base, showInCarousel: false })).toContain('скрыта')
    expect(carouselLine({ ...base, bannerMobileUrl: null })).toContain('нет мобильного баннера')
    expect(carouselLine({ ...base, status: 'DISABLED' })).toContain('выключена')
    expect(carouselLine({ ...base, status: 'SCHEDULED' })).toContain('начнётся')
    expect(carouselLine({ ...base, status: 'FINISHED' })).toContain('закончилась')
    expect(carouselLine({ ...base, status: 'ARCHIVED' })).toContain('в архиве')
  })

  it('names the same reason as the server: status first, then banner, then the choice', () => {
    const finishedNoBanner = { ...base, bannerMobileUrl: null, status: 'FINISHED' as const }
    expect(carouselLine(finishedNoBanner)).toContain('закончилась')

    const hiddenAndOff = { ...base, showInCarousel: false, status: 'DISABLED' as const }
    expect(carouselLine(hiddenAndOff)).toContain('выключена')

    const hiddenNoBanner = { ...base, showInCarousel: false, bannerMobileUrl: null }
    expect(carouselLine(hiddenNoBanner)).toContain('нет мобильного баннера')
  })
})
