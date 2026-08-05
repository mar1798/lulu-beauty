import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '.'
import { feedConfirmDialog } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Диалог рендерится порталом, поэтому шаблонный smoke-тест не подходит.
 * Проверяем оба исхода и то, что промах мимо окна не считается отменой:
 * из двух вариантов пользователь обязан выбрать явно.
 */
describe('ConfirmDialog', () => {
  it('отдаёт подтверждение и отмену раздельно', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <ConfirmDialog {...feedConfirmDialog()} onConfirm={onConfirm} onCancel={onCancel} />
    )

    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('клик мимо окна ничего не отменяет', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    renderWidget(<ConfirmDialog {...feedConfirmDialog()} onCancel={onCancel} />)

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)

    expect(onCancel).not.toHaveBeenCalled()
  })
})
