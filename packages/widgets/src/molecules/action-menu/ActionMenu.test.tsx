import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu } from '.'
import { feedActionMenu } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Действия «LETO2026»' })

describe('ActionMenu', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ActionMenu {...feedActionMenu()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('закрыто до нажатия; нажатие раскрывает меню и ставит фокус на первый пункт', async () => {
    renderWidget(<ActionMenu {...feedActionMenu()} />)

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')

    await userEvent.click(trigger())

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Изменить' })).toHaveFocus()
  })

  it('стрелки водят по пунктам по кругу', async () => {
    renderWidget(<ActionMenu {...feedActionMenu()} />)
    await userEvent.click(trigger())

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Выключить' })).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'В архив' })).toHaveFocus()
  })

  it('выбор пункта зовёт его обработчик, закрывает меню и возвращает фокус', async () => {
    const onSelect = vi.fn()
    const props = feedActionMenu()

    props.items[1] = { ...props.items[1], onSelect }
    renderWidget(<ActionMenu {...props} />)

    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Выключить' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape закрывает меню и возвращает фокус на кнопку', async () => {
    renderWidget(<ActionMenu {...feedActionMenu()} />)
    await userEvent.click(trigger())

    await userEvent.keyboard('{Escape}')

    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('заблокированный пункт не срабатывает', async () => {
    const onSelect = vi.fn()
    const props = feedActionMenu()

    props.items[1] = { ...props.items[1], onSelect, disabled: true }
    renderWidget(<ActionMenu {...props} />)

    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Выключить' }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('переход - ссылка', async () => {
    renderWidget(<ActionMenu {...feedActionMenu()} />)
    await userEvent.click(trigger())

    expect(screen.getByRole('menuitem', { name: 'Дублировать' })).toHaveAttribute(
      'href',
      '/admin/promo-codes/add?from=1'
    )
  })
})
