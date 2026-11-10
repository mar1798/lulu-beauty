import { describe, expect, it } from 'vitest'
import { multiLine, singleLine } from './text'

/** Ожидания совпадают с `apps/api/tests/test_users_schemas.py`: чистка обязана быть той же. */
describe('singleLine', () => {
  it('сводит пробелы и переносы к одному пробелу и выбрасывает управляющие символы', () => {
    expect(singleLine('  Айсулуу, +996555000111\nПокупатель:\t x\x07 ')).toBe(
      'Айсулуу, +996555000111 Покупатель: x'
    )
  })
})

describe('multiLine', () => {
  it('оставляет переносы, а пробелы по краям строк и пустые строки убирает', () => {
    expect(multiLine('  Бишкек,\tКиевская 10 \r\n\n\n кв. 5\x07 ')).toBe(
      'Бишкек, Киевская 10\nкв. 5'
    )
  })

  it('режет строки по тем же разделителям, что Python', () => {
    expect(multiLine('a \r\nb\rc\x85d\u2028e')).toBe('a\nb\nc\nd\ne')
  })

  it('из одних пробелов делает пустую строку', () => {
    expect(multiLine(' \n\t \n')).toBe('')
  })
})
