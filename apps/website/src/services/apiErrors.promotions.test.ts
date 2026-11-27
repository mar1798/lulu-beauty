import { describe, expect, it } from 'vitest'
import { ApiError, messageForError, toApiError } from './apiErrors'

describe('ошибки акций', () => {
  it('slug занят — своё сообщение на создании и на правке', () => {
    const error = new ApiError(409, 'promotion_slug_taken')

    expect(messageForError(error, 'admin.promotion.create')).toMatch(/адрес \(slug\)/i)
    expect(messageForError(error, 'admin.promotion.update')).toMatch(/архивной/)
  })

  it('удалённую акцию на правке называет прямо', () => {
    expect(
      messageForError(new ApiError(404, 'promotion_not_found'), 'admin.promotion.update')
    ).toMatch(/уже удалили/)
  })

  it('отказы картинки баннера и подарка — те же, что у фото товара', () => {
    const error = new ApiError(415, 'unsupported_image_type')

    expect(messageForError(error, 'admin.promotion.banner')).toMatch(/JPG, PNG или WebP/)
    expect(messageForError(error, 'admin.promotion.giftImage')).toMatch(/JPG, PNG или WebP/)
  })

  it('«конец раньше начала» не теряется без своей области', () => {
    expect(
      messageForError(new ApiError(422, 'promotion_ends_before_start'), 'admin.promotion.create')
    ).toMatch(/позже, чем начинается/)
  })

  it('409 про недействительные правила ведёт к повторному выбору', () => {
    expect(
      messageForError(new ApiError(409, 'promotion_invalid_rules'), 'admin.promotion.update')
    ).toMatch(/Выберите их заново/)
  })

  it('русская проверка бэкенда (422) показывается как есть, без «Value error»', () => {
    const error = new ApiError(422, 'validation_error', [
      { field: '', rule: 'в акции может быть только один промокод' },
    ])

    expect(messageForError(error, 'admin.promotion.update')).toBe(
      'В акции может быть только один промокод.'
    )
  })

  it('422 по вложенной строке называет награду и поле', () => {
    const error = new ApiError(422, 'validation_error', [{ field: 'value', rule: 'не больше 100' }])

    expect(messageForError(error, 'admin.promotion.update')).toBe('Значение скидки: не больше 100.')
  })
})

describe('разбор ответа 422', () => {
  it('проверка на `body` без поля превращается в русское предложение', async () => {
    const response = new Response(
      JSON.stringify({
        detail: [
          {
            type: 'value_error',
            loc: ['body'],
            msg: 'Value error, в акции может быть только один промокод',
          },
        ],
      }),
      { status: 422 }
    )
    const error = await toApiError(response)

    expect(messageForError(error, 'admin.promotion.create')).toBe(
      'В акции может быть только один промокод.'
    )
    expect(error.fields).toEqual({})
  })
})
