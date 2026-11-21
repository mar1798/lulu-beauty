import { describe, expect, it } from 'vitest'
import { promotionDescription, promotionPlainText, promotionTitle } from './promotionSeo'

describe('promotionPlainText', () => {
  it('убирает теги, но не склеивает слова на границах блоков', () => {
    expect(promotionPlainText('<p>Скидка 10%</p><p>на <strong>всё</strong></p>')).toBe(
      'Скидка 10% на всё'
    )
  })

  it('возвращает сущности и сворачивает пробелы', () => {
    expect(promotionPlainText('<p>Крем&nbsp;&amp;   тонер</p>')).toBe('Крем & тонер')
  })

  it('пустое описание - пустая строка', () => {
    expect(promotionPlainText(null)).toBe('')
    expect(promotionPlainText('')).toBe('')
  })
})

describe('promotionTitle', () => {
  it('добавляет «акция» и марку', () => {
    expect(promotionTitle({ title: 'Чёрная пятница' })).toBe('Чёрная пятница - акция Sululu')
  })
})

describe('promotionDescription', () => {
  const format = (iso: string): string => iso.slice(0, 10)

  it('берёт текст владельца', () => {
    expect(
      promotionDescription(
        {
          title: 'Весна',
          descriptionHtml: '<p>Скидка на уход.</p>',
          startsAt: '2026-03-01T00:00:00Z',
          endsAt: '2026-04-01T00:00:00Z',
        },
        format
      )
    ).toBe('Скидка на уход.')
  })

  it('без текста называет акцию и срок', () => {
    expect(
      promotionDescription(
        {
          title: 'Весна',
          descriptionHtml: null,
          startsAt: '2026-03-01T00:00:00Z',
          endsAt: '2026-04-01T00:00:00Z',
        },
        format
      )
    ).toBe('Весна - до 2026-04-01.')
  })

  it('у акции без даты окончания называет только старт', () => {
    expect(
      promotionDescription(
        { title: 'Весна', descriptionHtml: null, startsAt: '2026-03-01T00:00:00Z', endsAt: null },
        format
      )
    ).toBe('Весна - с 2026-03-01.')
  })

  it('режет по границе слова до длины сниппета', () => {
    const long = `<p>${'слово '.repeat(60)}</p>`
    const result = promotionDescription(
      {
        title: 'Весна',
        descriptionHtml: long,
        startsAt: '2026-03-01T00:00:00Z',
        endsAt: '2026-04-01T00:00:00Z',
      },
      format
    )

    expect(result.length).toBeLessThanOrEqual(160)
    expect(result.endsWith('…')).toBe(true)
    expect(result).not.toMatch(/\sсло…$/)
  })
})
