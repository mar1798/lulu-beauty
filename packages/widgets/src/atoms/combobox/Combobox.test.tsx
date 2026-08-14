import { useState, type FC } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from '.'
import type { IComboboxProps } from '../../types'
import { feedCombobox } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Поле управляемое, поэтому набор проверяется через обёртку с состоянием:
 * с `onChange`-заглушкой значение не менялось бы и подсказки не фильтровались.
 * `onChange` при этом остаётся видимым — им проверяется, что именно уходит
 * наружу (например, приведённое к известному написание).
 */
const Controlled: FC<Partial<IComboboxProps>> = props => {
  const feed = feedCombobox()
  const [value, setValue] = useState(props.value ?? feed.value)

  return (
    <Combobox
      {...feed}
      {...props}
      value={value}
      onChange={next => {
        setValue(next)
        props.onChange?.(next)
      }}
    />
  )
}

describe('Combobox', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Combobox {...feedCombobox()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('до раскрытия списка в разметке нет', () => {
    renderWidget(<Combobox {...feedCombobox()} />)

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('раскрывает весь список по кнопке подсказок', async () => {
    renderWidget(<Controlled />)
    await userEvent.click(screen.getByRole('button', { name: 'Показать подсказки' }))

    expect(screen.getAllByRole('option')).toHaveLength(5)
  })

  it('фильтрует подсказки по набранному без учёта регистра', async () => {
    renderWidget(<Controlled />)
    await userEvent.type(screen.getByRole('combobox'), 'ROUND')

    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Round Lab'])
  })

  it('находит подсказку и по середине названия', async () => {
    renderWidget(<Controlled />)
    await userEvent.type(screen.getByRole('combobox'), 'peel')

    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Medi-Peel'])
  })

  it('отдаёт выбранную мышью подсказку и закрывает список', async () => {
    const onChange = vi.fn()

    renderWidget(<Controlled onChange={onChange} />)
    await userEvent.type(screen.getByRole('combobox'), 'lan')
    await userEvent.click(screen.getByRole('option', { name: 'Laneige' }))

    expect(onChange).toHaveBeenLastCalledWith('Laneige')
    expect(screen.getByRole('combobox')).toHaveValue('Laneige')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('выбирает подсказку стрелкой и Enter', async () => {
    const onChange = vi.fn()

    renderWidget(<Controlled onChange={onChange} />)
    await userEvent.type(screen.getByRole('combobox'), 'co')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenLastCalledWith('COSRX')
  })

  it('приводит набранное к уже известному написанию на выходе из поля', async () => {
    const onChange = vi.fn()

    renderWidget(<Controlled onChange={onChange} />)
    await userEvent.type(screen.getByRole('combobox'), 'round lab')
    await userEvent.tab()

    expect(onChange).toHaveBeenLastCalledWith('Round Lab')
  })

  it('оставляет новое значение как набрано', async () => {
    const onChange = vi.fn()

    renderWidget(<Controlled onChange={onChange} />)
    await userEvent.type(screen.getByRole('combobox'), '  Beauty of Joseon  ')
    await userEvent.tab()

    // Обрезаются только пробелы по краям: чужой регистр — это не наше дело.
    expect(onChange).toHaveBeenLastCalledWith('Beauty of Joseon')
    expect(screen.getByRole('combobox')).toHaveValue('Beauty of Joseon')
  })

  it('помечает совпавшую подсказку для скринридера независимо от регистра', async () => {
    renderWidget(<Controlled value="cosrx" />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'COSRX' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Laneige' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  it('показывает весь список, когда набранное уже совпало с подсказкой', async () => {
    // Иначе поменять бренд у товара было бы нечем: список схлопывался бы до
    // одной строки — той, что уже выбрана.
    renderWidget(<Controlled value="Round Lab" />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.getAllByRole('option')).toHaveLength(5)
  })

  it('сообщает, когда под набранное ничего не нашлось', async () => {
    renderWidget(<Controlled />)
    await userEvent.type(screen.getByRole('combobox'), 'ничего такого')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
  })

  it('Escape закрывает список, не трогая набранное', async () => {
    renderWidget(<Controlled />)
    await userEvent.type(screen.getByRole('combobox'), 'co')
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(screen.getByRole('combobox')).toHaveValue('co')
  })
})
