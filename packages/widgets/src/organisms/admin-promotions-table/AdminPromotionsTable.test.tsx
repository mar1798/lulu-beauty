import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromotionsTable } from '.'
import { feedAdminPromotionsTable } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('AdminPromotionsTable', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('все действия строки — иконки: подсказка называет действие, aria-label — ещё и акцию', () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    const rows = screen.getAllByRole('row').slice(1)
    const actions = within(rows[0]).getAllByRole('tooltip', { hidden: true })

    expect(actions.length).toBeGreaterThanOrEqual(5)

    for (const tooltip of actions) {
      const control = tooltip.parentElement?.querySelector('[aria-label]')

      const action = tooltip.textContent ?? ''

      expect(action).not.toContain('«')
      expect(control?.getAttribute('aria-label')).toMatch(new RegExp(`^${action} «.+»$`))
    }
  })

  it('в строке нет текстовых кнопок: имя каждой кнопки — скрытая подпись иконки', () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    for (const button of screen.getAllByRole('button')) {
      expect(button.querySelector('svg')).not.toBeNull()
    }
  })

  it('удаление акции с участниками называется «В архив», без участников — «Удалить»', () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    expect(
      screen.getByRole('button', { name: 'В архив «Весенняя распродажа»' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Удалить «Подарок за три/ })).toBeInTheDocument()
  })

  it('архивной акции не предлагает ни включить, ни удалить', () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    expect(screen.queryByRole('button', { name: 'Удалить «Прошлогодняя акция»' })).toBeNull()
    expect(screen.queryByRole('button', { name: /«Прошлогодняя акция»/ })).toBeInTheDocument()
    expect(screen.getAllByText('В архиве').length).toBeGreaterThan(0)
  })

  it('включённая акция предлагает «Выключить», выключенная — «Включить»', async () => {
    const props = feedAdminPromotionsTable()
    const onToggleEnabled = vi.fn()

    renderWidget(<AdminPromotionsTable {...props} onToggleEnabled={onToggleEnabled} />)

    await userEvent.click(screen.getByRole('button', { name: 'Включить «Осенний сбор»' }))

    expect(onToggleEnabled).toHaveBeenCalledWith(expect.objectContaining({ title: 'Осенний сбор' }))
    expect(
      screen.getByRole('button', { name: 'Выключить «Весенняя распродажа»' })
    ).toBeInTheDocument()
  })

  it('«Дублировать» и «Изменить» — ссылки', () => {
    renderWidget(<AdminPromotionsTable {...feedAdminPromotionsTable()} />)

    expect(screen.getByRole('link', { name: 'Дублировать «Весенняя распродажа»' })).toHaveAttribute(
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

    await userEvent.click(screen.getByRole('button', { name: 'Участники «Весенняя распродажа»' }))
    await userEvent.click(screen.getByRole('button', { name: 'В архив «Весенняя распродажа»' }))

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
