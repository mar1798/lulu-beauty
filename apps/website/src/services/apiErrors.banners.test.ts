import { describe, expect, it } from 'vitest'
import { ApiError, messageForError, type ErrorScope } from './apiErrors'

const SCOPES: ErrorScope[] = [
  'admin.banners.load',
  'admin.banner.toggle',
  'admin.banner.reorder',
  'admin.news.load',
  'admin.news.create',
  'admin.news.update',
  'admin.news.toggle',
  'admin.news.delete',
  'admin.news.image',
]

const CODES: [string, number][] = [
  ['banner_not_found', 404],
  ['banner_order_mismatch', 409],
  ['banner_ends_before_start', 422],
  ['banner_link_invalid', 422],
  ['too_many_news_banners', 409],
]

describe('ошибки баннеров', () => {
  it.each(CODES)('код %s даёт русский текст, а не заглушку', (code, status) => {
    const message = messageForError(new ApiError(status, code), 'admin.news.create')

    expect(message).toMatch(/[а-яё]/i)
    expect(message).not.toBe('Не удалось создать новость')
    expect(message).not.toContain(code)
    expect(message).not.toContain('—')
  })

  it('тексты из плана', () => {
    expect(messageForError(new ApiError(404, 'banner_not_found'), 'admin.news.load')).toBe(
      'Новость не найдена - возможно, её уже удалили'
    )
    expect(
      messageForError(new ApiError(409, 'banner_order_mismatch'), 'admin.banner.reorder')
    ).toBe('Список баннеров изменился, пока вы его правили - порядок обновлён, повторите')
    expect(messageForError(new ApiError(409, 'too_many_news_banners'), 'admin.news.create')).toBe(
      'Новостей не больше 20 - удалите ненужные'
    )
  })

  it('акция в разделе баннеров: нет акции - своё сообщение', () => {
    expect(messageForError(new ApiError(404, 'promotion_not_found'), 'admin.banner.toggle')).toBe(
      'Акция не найдена - возможно, её удалили или убрали в архив'
    )
  })

  it('отказы картинки новости - те же, что у баннера акции', () => {
    expect(
      messageForError(new ApiError(415, 'unsupported_image_type'), 'admin.news.image')
    ).toMatch(/JPG, PNG или WebP/)
    expect(messageForError(new ApiError(404, 'banner_not_found'), 'admin.news.image')).toMatch(
      /уже удалили/
    )
  })

  it.each(SCOPES)('у области %s есть собственная заглушка', scope => {
    const message = messageForError(new Error('boom'), scope)

    expect(message).toMatch(/^Не удалось/)
  })
})
