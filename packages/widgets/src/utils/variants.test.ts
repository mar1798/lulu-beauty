import { describe, expect, it } from 'vitest'
import type { IProductImage, IProductVariant } from '../types'
import {
  formatShadeCount,
  formatVariant,
  hasPriceRange,
  imagesForVariant,
  shadeKey,
  taggableVolumes,
} from './variants'
import { formatVolumes } from './volume'

const image = (id: string, patch: Partial<IProductImage> = {}): IProductImage => ({
  id,
  url: `${id}.jpg`,
  alt: null,
  sortOrder: 0,
  isPrimary: false,
  ...patch,
})

const variant = (patch: Partial<IProductVariant>): IProductVariant => ({
  id: 'v',
  volumeMl: null,
  shade: null,
  priceCents: 1000,
  inStock: true,
  ...patch,
})

describe('варианты', () => {
  it('сравнивает тона без регистра и лишних пробелов', () => {
    expect(shadeKey('  05   Rose ')).toBe('05 rose')
    expect(shadeKey('')).toBeNull()
  })

  it('называет вариант так же, как бэкенд', () => {
    expect(formatVariant(50, '05 Rose')).toBe('50 мл, 05 Rose')
    expect(formatVariant(null, '05 Rose')).toBe('05 Rose')
    expect(formatVariant(null, null)).toBeNull()
  })

  it('не пишет «от» у тонов одной цены', () => {
    expect(hasPriceRange([variant({ shade: '01' }), variant({ shade: '05' })])).toBe(false)
    expect(hasPriceRange([variant({ priceCents: 1 }), variant({ priceCents: 2 })])).toBe(true)
  })

  it('считает тона и не повторяет объёмы', () => {
    const variants = [30, 50].flatMap(volumeMl =>
      ['01', '05'].map(shade => variant({ volumeMl, shade }))
    )

    expect(formatShadeCount(variants)).toBe('2 оттенка')
    expect(formatVolumes(variants)).toBe('30 / 50 мл')
  })

  it('ставит фото тона первым и прячет фото чужих тонов', () => {
    const images = [
      image('common', { isPrimary: true }),
      image('rose', { sortOrder: 1, shades: ['05 Rose'] }),
      image('nude', { sortOrder: 2, shades: ['01 Nude'] }),
    ]

    const ordered = imagesForVariant(images, { volumeMl: null, shade: '05 rose' })

    expect(ordered.map(item => item.id)).toEqual(['rose', 'common'])
    expect(ordered[0].isPrimary).toBe(true)
  })

  it('показывает фото нескольких тонов у каждого из них', () => {
    const images = [
      image('common', { isPrimary: true }),
      image('pair', { sortOrder: 1, shades: ['01 Nude', '05 Rose'] }),
      image('berry', { sortOrder: 2, shades: ['12 Berry'] }),
    ]

    expect(
      imagesForVariant(images, { volumeMl: null, shade: '01 nude' }).map(item => item.id)
    ).toEqual(['pair', 'common'])
    expect(
      imagesForVariant(images, { volumeMl: null, shade: '05 Rose' }).map(item => item.id)
    ).toEqual(['pair', 'common'])
  })

  it('требует, чтобы подошли и объём, и тон', () => {
    const images = [
      image('common', { isPrimary: true }),
      image('big-rose', { sortOrder: 1, volumesMl: [50, 100], shades: ['05 Rose'] }),
    ]

    expect(
      imagesForVariant(images, { volumeMl: 100, shade: '05 Rose' }).map(item => item.id)
    ).toEqual(['big-rose', 'common'])
    expect(
      imagesForVariant(images, { volumeMl: 30, shade: '05 Rose' }).map(item => item.id)
    ).toEqual(['common'])
  })

  it('без подходящих фото отдаёт галерею как есть', () => {
    const images = [image('nude', { shades: ['01 Nude'] })]

    expect(imagesForVariant(images, { volumeMl: null, shade: '05 Rose' })).toBe(images)
  })
})

describe('привязки фото', () => {
  /** 30 мл в двух тонах, 50 мл — в одном. */
  const variants = [
    { volumeMl: 30, shade: '21 Light' },
    { volumeMl: 30, shade: '23 Beige' },
    { volumeMl: 50, shade: '21 Light' },
  ]

  it('скрытое фото не попадает в галерею ни с вариантом, ни без', () => {
    const images = [image('hidden', { hidden: true }), image('rest', { sortOrder: 1 })]

    expect(imagesForVariant(images, null).map(({ id }) => id)).toEqual(['rest'])
    expect(
      imagesForVariant(images, { volumeMl: 30, shade: '21 Light' }).map(({ id }) => id)
    ).toEqual(['rest'])
  })

  it('объёмы для привязки — только когда их больше одного', () => {
    expect(taggableVolumes(variants)).toEqual([30, 50])
    expect(taggableVolumes([{ volumeMl: 30 }, { volumeMl: 30 }, { volumeMl: null }])).toEqual([])
  })
})
