import { describe, expect, it } from 'vitest'
import { normalizeLinkHref, plainTextToHtml, richTextLength } from './richText'

describe('plainTextToHtml', () => {
  it('пустая строка — граница абзаца, одиночный перенос — перенос внутри него', () => {
    expect(plainTextToHtml('Первый\nвторой\n\nТретий')).toBe('<p>Первый<br>второй</p><p>Третий</p>')
  })

  it('экранирует разметку, набранную текстом', () => {
    expect(plainTextToHtml('Крем <b> & тоник')).toBe('<p>Крем &lt;b&gt; &amp; тоник</p>')
  })

  it('пустой текст — пустой HTML', () => {
    expect(plainTextToHtml('  \n\n ')).toBe('')
  })
})

describe('normalizeLinkHref', () => {
  it.each([
    ['https://brand.com/a', 'https://brand.com/a'],
    ['brand.com', 'https://brand.com'],
    ['www.brand.co.kr/ru', 'https://www.brand.co.kr/ru'],
    ['shop@brand.com', 'mailto:shop@brand.com'],
    ['+996 555 123 456', 'tel:+996555123456'],
    ['mailto:shop@brand.com', 'mailto:shop@brand.com'],
    ['brand.com:8080/ru', 'https://brand.com:8080/ru'],
  ])('%s → %s', (raw, href) => {
    expect(normalizeLinkHref(raw)).toBe(href)
  })

  it.each(['', '   ', 'javascript:alert(1)', 'data:text/html,x', 'просто текст'])(
    '%j — не ссылка',
    raw => {
      expect(normalizeLinkHref(raw)).toBeNull()
    }
  )
})

describe('richTextLength', () => {
  it('считает видимые символы: без тегов, без переносов между абзацами', () => {
    expect(richTextLength('<h2>Раз</h2><p>два<br>три</p><ul><li><p>ч</p></li></ul>')).toBe(10)
  })

  it('сущность — один символ', () => {
    expect(richTextLength('<p>a &amp; b&nbsp;&lt;3 &#1046;</p>')).toBe(10)
  })
})
