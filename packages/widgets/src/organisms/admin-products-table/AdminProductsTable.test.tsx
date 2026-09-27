import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminProductsTable } from '.'
import { feedAdminProductsTable } from '../../stories/feed'
import { renderWidget } from '../../testing/render'
import type { IAdminProductSort } from '../../types'

const renderTable = (sort: IAdminProductSort): ReturnType<typeof vi.fn> => {
  const onSortChange = vi.fn()

  renderWidget(
    <AdminProductsTable {...feedAdminProductsTable()} sort={sort} onSortChange={onSortChange} />
  )

  return onSortChange
}

describe('AdminProductsTable', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminProductsTable {...feedAdminProductsTable()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('объявляет направление только у активной колонки', () => {
    renderTable({ field: 'price', direction: 'asc' })

    expect(screen.getByRole('columnheader', { name: 'Цена' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )
    expect(screen.getByRole('columnheader', { name: 'Товар' })).not.toHaveAttribute('aria-sort')
  })

  it('повторный щелчок по активной колонке разворачивает порядок', async () => {
    const onSortChange = renderTable({ field: 'price', direction: 'asc' })

    await userEvent.click(screen.getByRole('button', { name: 'Цена' }))

    expect(onSortChange).toHaveBeenCalledWith({ field: 'price', direction: 'desc' })
  })

  it('новая колонка начинает со своего естественного конца', async () => {
    const onSortChange = renderTable({ field: 'price', direction: 'asc' })

    await userEvent.click(screen.getByRole('button', { name: 'Добавлен' }))
    await userEvent.click(screen.getByRole('button', { name: 'Товар' }))

    expect(onSortChange).toHaveBeenNthCalledWith(1, { field: 'created', direction: 'desc' })
    expect(onSortChange).toHaveBeenNthCalledWith(2, { field: 'name', direction: 'asc' })
  })
})
