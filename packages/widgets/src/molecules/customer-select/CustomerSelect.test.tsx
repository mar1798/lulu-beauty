import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerSelect } from '.'
import { feedCustomerOption, feedCustomerSelect } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('CustomerSelect', () => {
  it('выбирает покупателя кликом по строке', async () => {
    const onChange = vi.fn()
    const props = feedCustomerSelect()
    const user = userEvent.setup()

    renderWidget(<CustomerSelect {...props} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Айгуль/ }))

    expect(onChange).toHaveBeenCalledWith(props.results?.[0])
  })

  it('в строке есть телефон и метка тех, кто не в боте', () => {
    renderWidget(<CustomerSelect {...feedCustomerSelect()} />)

    expect(screen.getByText('+996700123456')).toBeTruthy()
    expect(screen.getAllByText('Не в боте')).toHaveLength(1)
  })

  it('без запроса подсказывает, что вводить, а не «никого нет»', () => {
    renderWidget(<CustomerSelect {...feedCustomerSelect()} query="" results={null} />)

    expect(screen.getByText('Начните вводить имя или номер телефона')).toBeTruthy()
  })

  it('выбранный покупатель снимается кнопкой «Изменить»', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <CustomerSelect
        {...feedCustomerSelect()}
        value={feedCustomerOption({ name: 'Чолпон' })}
        onChange={onChange}
      />
    )

    expect(screen.queryByRole('searchbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Изменить' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('сбой поиска не выдаётся за пустой ответ', () => {
    renderWidget(<CustomerSelect {...feedCustomerSelect()} error="Не удалось найти" />)

    expect(screen.getByText('Не удалось найти')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Айгуль/ })).toBeNull()
  })
})
