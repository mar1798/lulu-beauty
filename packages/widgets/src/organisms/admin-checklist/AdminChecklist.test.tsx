import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminChecklist } from '.'
import { feedAdminChecklist } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('AdminChecklist', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminChecklist {...feedAdminChecklist()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('отмечает строку и по чекбоксу, и по любому месту строки', async () => {
    const props = feedAdminChecklist()
    const onToggle = vi.fn()
    const [first] = props.items

    renderWidget(<AdminChecklist {...props} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Гидрофильное масло/ }))
    await userEvent.click(screen.getByText('Anua · 200 мл'))

    // Ровно два вызова: щелчок по чекбоксу не должен всплыть до строки вторым переключением.
    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(onToggle).toHaveBeenNthCalledWith(1, first.key, true)
    expect(onToggle).toHaveBeenNthCalledWith(2, first.key, true)
  })

  it('снимает отметку с отмеченной строки и красит её', async () => {
    const props = feedAdminChecklist()
    const onToggle = vi.fn()

    renderWidget(<AdminChecklist {...props} onToggle={onToggle} />)
    const row = screen.getByText('Тонер Heartleaf 77').closest('tr')
    expect(row?.getAttribute('data-checked')).toBe('true')

    await userEvent.click(screen.getByText('Anua · 250 мл'))

    expect(onToggle).toHaveBeenCalledWith(props.checkedKeys[0], false)
  })

  it('считает прогресс только по строкам, которые есть в списке', () => {
    renderWidget(
      <AdminChecklist
        {...feedAdminChecklist()}
        checkedKeys={['Тонер Heartleaf 77|250|165000', 'исчезнувшая']}
      />
    )

    expect(screen.getByText('Отмечено 1 из 5')).toBeTruthy()
  })

  it('ведёт названием на страницу товара, не отмечая строку', async () => {
    const onToggle = vi.fn()

    renderWidget(<AdminChecklist {...feedAdminChecklist()} onToggle={onToggle} />)
    const link = screen.getByRole('link', { name: 'Гидрофильное масло Pure Cleansing' })
    link.addEventListener('click', event => {
      event.preventDefault()
    })
    await userEvent.click(link)

    expect(link.getAttribute('href')).toBe('/catalog/product-0')
    expect(onToggle).not.toHaveBeenCalled()
    // Товара в каталоге нет — название остаётся текстом.
    expect(screen.queryByRole('link', { name: 'Патчи для глаз' })).toBeNull()
  })

  it('пишет цену за штуку в целых сомах', () => {
    renderWidget(<AdminChecklist {...feedAdminChecklist()} />)

    // В фикстуре патчи стоят 600,50 — в колонке от этого остаётся «601».
    expect(screen.getByText('601')).toBeTruthy()
    expect(screen.queryByText('600,50')).toBeNull()
  })
})
