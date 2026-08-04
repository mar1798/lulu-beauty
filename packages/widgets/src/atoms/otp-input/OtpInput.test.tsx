import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OtpInput } from '.'
import { renderWidget } from '../../testing/render'

/**
 * Код почти всегда вставляют целиком из уведомления Telegram, поэтому
 * вставка и автопереход — не украшение, а основной сценарий.
 */
describe('OtpInput', () => {
  it('рисует по ячейке на цифру', () => {
    renderWidget(<OtpInput value="" onChange={vi.fn()} />)

    expect(screen.getAllByRole('textbox')).toHaveLength(6)
  })

  it('раскладывает уже набранное значение по ячейкам', () => {
    renderWidget(<OtpInput value="1234" onChange={vi.fn()} />)

    const cells = screen.getAllByRole('textbox')

    expect(cells[0]).toHaveValue('1')
    expect(cells[3]).toHaveValue('4')
    expect(cells[4]).toHaveValue('')
  })

  it('переводит фокус на следующую ячейку после ввода цифры', async () => {
    const onChange = vi.fn()

    renderWidget(<OtpInput value="" onChange={onChange} />)

    const cells = screen.getAllByRole('textbox')

    await userEvent.type(cells[0], '7')

    expect(onChange).toHaveBeenCalledWith('7')
    expect(cells[1]).toHaveFocus()
  })

  it('разливает вставленный код по всем ячейкам и сообщает о готовности', async () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()

    renderWidget(<OtpInput value="" onChange={onChange} onComplete={onComplete} />)
    await userEvent.click(screen.getAllByRole('textbox')[0])
    await userEvent.paste('123456')

    expect(onChange).toHaveBeenLastCalledWith('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('игнорирует нецифровые символы во вставке', async () => {
    const onChange = vi.fn()

    renderWidget(<OtpInput value="" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('textbox')[0])
    await userEvent.paste('Ваш код: 12-34-56')

    expect(onChange).toHaveBeenLastCalledWith('123456')
  })

  it('возвращает фокус назад по Backspace в пустой ячейке', async () => {
    renderWidget(<OtpInput value="12" onChange={vi.fn()} />)

    const cells = screen.getAllByRole('textbox')

    await userEvent.click(cells[2])
    await userEvent.keyboard('{Backspace}')

    expect(cells[1]).toHaveFocus()
  })
})
