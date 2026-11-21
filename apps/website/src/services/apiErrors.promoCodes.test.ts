import { describe, expect, it } from 'vitest'
import { ApiError, messageForError } from './apiErrors'

describe('ошибки промокодов владельца', () => {
  it('код занят, неверный формат и несуществующий покупатель - свои тексты', () => {
    expect(
      messageForError(new ApiError(409, 'promo_code_taken'), 'admin.promoCode.create')
    ).toMatch(/Такой код уже есть/)
    expect(
      messageForError(new ApiError(422, 'promo_code_invalid'), 'admin.promoCode.update')
    ).toMatch(/от 4 до 16/)
    expect(
      messageForError(new ApiError(422, 'promo_code_user_not_found'), 'admin.promoCode.create')
    ).toMatch(/Покупатель не найден/)
  })

  it('«конец раньше начала» говорит про промокод, а не про акцию', () => {
    expect(
      messageForError(new ApiError(422, 'promotion_ends_before_start'), 'admin.promoCode.create')
    ).toMatch(/Промокод должен/)
  })

  it('удалённый код называет прямо на правке, переключении, удалении и использованиях', () => {
    const error = new ApiError(404, 'promo_code_not_found')

    expect(messageForError(error, 'admin.promoCode.update')).toMatch(/уже удалили/)
    expect(messageForError(error, 'admin.promoCode.toggle')).toMatch(/уже удалили/)
    expect(messageForError(error, 'admin.promoCode.delete')).toMatch(/уже удалили/)
    expect(messageForError(error, 'admin.promoCode.participants')).toMatch(/уже удалили/)
  })

  it('покупателю общий код больше не «в вашем аккаунте»', () => {
    for (const scope of ['checkout', 'promoCode.check'] as const) {
      expect(messageForError(new ApiError(404, 'promo_code_not_found'), scope)).not.toMatch(
        /в вашем аккаунте/
      )
      expect(messageForError(new ApiError(409, 'promo_code_already_used'), scope)).toMatch(
        /Вы уже использовали этот промокод/
      )
      expect(messageForError(new ApiError(409, 'promo_code_conditions_not_met'), scope)).toBe(
        'Корзина не подходит под условия промокода.'
      )
    }
  })
})
