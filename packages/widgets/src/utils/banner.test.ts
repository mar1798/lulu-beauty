import { describe, expect, it } from 'vitest'
import {
  BANNER_STATE_LABELS,
  bannerStateLabel,
  isExternalBannerLink,
  isValidBannerLink,
} from './banner'

describe('isValidBannerLink', () => {
  it.each([
    '/',
    '/catalog',
    '/catalog?category=lips&page=2',
    '/promotions/black-friday#rules',
    'https://example.com',
    'https://example.com/news/1?utm=x',
    'https://sub.example.com:8443/a',
  ])('пускает %s', url => {
    expect(isValidBannerLink(url)).toBe(true)
  })

  it.each([
    '',
    'http://example.com',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example',
    '/\\evil.example',
    '/catalog with space',
    ' /catalog',
    '/catalog\n',
    'https://',
    'https:///path',
    'https://exa mple.com',
    'ftp://example.com',
    'mailto:a@b.c',
    'catalog',
    'www.example.com',
  ])('не пускает %j', url => {
    expect(isValidBannerLink(url)).toBe(false)
  })
})

describe('isExternalBannerLink', () => {
  it('внешняя - только https', () => {
    expect(isExternalBannerLink('https://example.com')).toBe(true)
    expect(isExternalBannerLink('/catalog')).toBe(false)
  })
})

describe('bannerStateLabel', () => {
  it('у новости завершённая - «Истекла», у акции - «Завершена»', () => {
    expect(bannerStateLabel('NEWS', 'FINISHED')).toBe('Истекла')
    expect(bannerStateLabel('PROMOTION', 'FINISHED')).toBe('Завершена')
  })

  it('остальные состояния одинаковы для обоих видов', () => {
    expect(bannerStateLabel('NEWS', 'SHOWN')).toBe(BANNER_STATE_LABELS.SHOWN)
    expect(bannerStateLabel('PROMOTION', 'PROMOTION_OFF')).toBe('Акция выключена')
  })
})
