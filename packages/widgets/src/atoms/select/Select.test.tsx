import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from '.'
import { anchorTo } from './Select'
import { feedSelect } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/** Заглушка поля с заданным прямоугольником: `anchorTo` больше ничего не читает. */
const triggerAt = (rect: { top: number; bottom: number }): HTMLElement =>
  ({
    getBoundingClientRect: () => ({ ...rect, left: 40, width: 200 }),
  }) as unknown as HTMLElement

/**
 * Поле собрано вручную вместо нативного `<select>`, поэтому всё, что раньше
 * давал браузер, приходится проверять самим: раскрытие, выбор мышью и
 * клавиатурой, роли для скринридера.
 */
describe('Select', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Select {...feedSelect()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('до раскрытия списка в разметке нет', () => {
    renderWidget(<Select {...feedSelect()} />)

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('показывает заглушку, пока ничего не выбрано', () => {
    renderWidget(<Select {...feedSelect()} />)

    expect(screen.getByRole('combobox')).toHaveTextContent('Все категории')
  })

  it('раскрывает список по клику и отдаёт выбранное значение', async () => {
    const onChange = vi.fn()

    renderWidget(<Select {...feedSelect()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('option', { name: 'Макияж' }))

    expect(onChange).toHaveBeenCalledWith('makeup')
    // Список ещё доигрывает исчезновение, поэтому ждём, пока он уйдёт из DOM.
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('помечает выбранную строку для скринридера', async () => {
    renderWidget(<Select {...feedSelect()} value="hair" />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'Волосы' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Макияж' })).toHaveAttribute('aria-selected', 'false')
  })

  it('водит по списку стрелками и выбирает Enter, не уводя фокус с поля', async () => {
    const onChange = vi.fn()

    renderWidget(<Select {...feedSelect()} onChange={onChange} />)

    const trigger = screen.getByRole('combobox')

    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')

    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // Первая доступная строка — заглушка «Все категории», дальше идут категории.
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('skincare')
    expect(trigger).toHaveFocus()
  })

  it('закрывает список по Escape, ничего не меняя', async () => {
    const onChange = vi.fn()

    renderWidget(<Select {...feedSelect()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ищет строку по первым буквам', async () => {
    const onChange = vi.fn()

    renderWidget(<Select {...feedSelect()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('вол{Enter}')

    expect(onChange).toHaveBeenCalledWith('hair')
  })

  it('не раскрывается, когда поле выключено', async () => {
    renderWidget(<Select {...feedSelect()} disabled={true} />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('у обязательного поля заглушка выбору не поддаётся', async () => {
    const onChange = vi.fn()

    renderWidget(<Select {...feedSelect()} required={true} onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'Все категории' }))

    expect(onChange).not.toHaveBeenCalled()
    // И список остаётся открытым: по заблокированной строке нажатие не значит ничего.
    // Проверяем после того, как исчезновение успело бы доиграть, — иначе тест проходил
    // бы и на закрывающемся списке, который просто ещё виден.
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'true'
    ))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('не закрывается от нажатия по самому списку', async () => {
    renderWidget(<Select {...feedSelect()} />)
    await userEvent.click(screen.getByRole('combobox'))

    // Список лежит порталом вне поля, поэтому обработчик «клик мимо» видит эти
    // нажатия наравне с нажатиями по странице и должен отличать их сам.
    await userEvent.click(screen.getByRole('listbox'))

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true')
  })

  it('отдаёт значение в форму под своим именем', () => {
    const { container } = renderWidget(<Select {...feedSelect()} name="category" value="hair" />)

    expect(container.querySelector('input[name="category"]')).toHaveValue('hair')
  })
})

/**
 * Раскладка списка считается вручную (портал + `fixed`), поэтому её проверяем
 * отдельно от разметки: в jsdom все прямоугольники нулевые, и через рендер
 * этот расчёт не увидеть.
 */
describe('Select · раскладка списка', () => {
  it('раскрывается вниз, когда снизу есть место', () => {
    const anchor = anchorTo(triggerAt({ top: 100, bottom: 144 }))

    expect(anchor.placement).toBe('bottom')
    expect(anchor.style).toMatchObject({ left: 40, width: 200, top: 150 })
  })

  it('раскрывается вверх у нижнего края окна', () => {
    // window.innerHeight в jsdom — 768; снизу остаётся меньше, чем сверху.
    const anchor = anchorTo(triggerAt({ top: 700, bottom: 744 }))

    expect(anchor.placement).toBe('top')
    expect(anchor.style).toMatchObject({ bottom: 768 - 700 + 6 })
  })

  it('не даёт списку вырасти выше потолка', () => {
    const anchor = anchorTo(triggerAt({ top: 20, bottom: 64 }))

    expect(anchor.style.maxHeight).toBe(288)
  })

  it('обрезает высоту по остатку места, когда его меньше потолка', () => {
    // Низкое окно (телефон в альбомной ориентации): потолок недостижим с любой стороны.
    const innerHeight = window.innerHeight

    window.innerHeight = 360

    const anchor = anchorTo(triggerAt({ top: 100, bottom: 144 }))

    expect(anchor.placement).toBe('bottom')
    expect(anchor.style.maxHeight).toBe(360 - 144 - 6 - 8)

    window.innerHeight = innerHeight
  })
})
