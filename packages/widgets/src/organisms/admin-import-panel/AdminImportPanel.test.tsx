import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminImportPanel } from '.'
import { feedAdminImportPanel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AdminImportPanel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminImportPanel {...feedAdminImportPanel()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('кнопка выгрузки зовёт onExport', () => {
    const onExport = vi.fn()

    renderWidget(<AdminImportPanel {...feedAdminImportPanel()} onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Выгрузить в Excel' }))

    expect(onExport).toHaveBeenCalled()
  })

  it('без onExport блока выгрузки нет — панель остаётся только импортом', () => {
    renderWidget(<AdminImportPanel {...feedAdminImportPanel()} onExport={undefined} />)

    expect(screen.queryByRole('button', { name: 'Выгрузить в Excel' })).toBeNull()
  })
})
