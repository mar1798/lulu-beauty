import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromotionsTable } from '.'
import { feedAdminPromotionsTable } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/** Раскрывает меню «⋯» строки и возвращает его. */
const openMenu = async (title: string): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: `Действия «${title}»` }))

  return screen.getByRole('menu', { name: `Действия «${title}»` })
}

describe('AdminPromotionsTable', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('действия строки - в меню «⋯», колонки участников нет', () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    expect(screen.queryByRole('columnheader', { name: 'Участники' })).toBeNull()

    const [, first] = screen.getAllByRole('row')

    expect(within(first).getAllByRole('button')).toHaveLength(1)
  })

  it('удаление акции с участниками называется «В архив», без участников - «Удалить»', async () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    const spring = await openMenu('Весенняя распродажа')

    expect(within(spring).getByRole('menuitem', { name: 'В архив' })).toBeInTheDocument()
  })

  it('архивной акции не предлагает ни включить, ни удалить', async () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    const menu = await openMenu('Прошлогодняя акция')

    expect(within(menu).queryByRole('menuitem', { name: /^(Удалить|В архив)$/ })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: /^(Включить|Выключить)$/ })).toBeNull()
    expect(screen.getAllByText('В архиве').length).toBeGreaterThan(0)
  })

  it('выключенная акция предлагает «Включить» и отдаёт её наверх', async () => {
    const onToggleEnabled = vi.fn()

    renderWidget(
      <AdminPromotionsTable {...feedAdminPromotionsTable()} onToggleEnabled={onToggleEnabled} />
    )

    const menu = await openMenu('Осенний сбор')

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Включить' }))

    expect(onToggleEnabled).toHaveBeenCalledWith(expect.objectContaining({ title: 'Осенний сбор' }))
  })

  it('«Дублировать» - ссылка', async () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    const menu = await openMenu('Весенняя распродажа')

    expect(within(menu).getByRole('menuitem', { name: 'Дублировать' })).toHaveAttribute(
      'href',
      expect.stringContaining('/admin/promotions/add?from=')
    )
  })

  it('«Участники» и удаление отдают акцию наверх', async () => {
    const onShowParticipants = vi.fn()
    const onDelete = vi.fn()

    renderWidget(
      <AdminPromotionsTable
        {...feedAdminPromotionsTable()}
        onShowParticipants={onShowParticipants}
        onDelete={onDelete}
      />
    )

    await userEvent.click(
      within(await openMenu('Весенняя распродажа')).getByRole('menuitem', { name: 'Участники' })
    )
    await userEvent.click(
      within(await openMenu('Весенняя распродажа')).getByRole('menuitem', { name: 'В архив' })
    )

    expect(onShowParticipants).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('без акций показывает пустое состояние', () => {
    renderWidget(
      <AdminPromotionsTable
        {...feedAdminPromotionsTable()}
        promotions={[]}
        emptyState={<p>Акций нет</p>}
      />
    )

    expect(screen.getByText('Акций нет')).toBeInTheDocument()
  })
})
