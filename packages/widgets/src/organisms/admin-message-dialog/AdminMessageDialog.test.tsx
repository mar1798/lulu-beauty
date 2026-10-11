import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminMessageDialog } from '.'
import { feedAdminMessageDialog } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Окно рендерится порталом, поэтому шаблонный smoke-тест не подходит.
 * Проверяем отправку, запрет пустого текста и то, что ошибка остаётся в окне.
 */
describe('AdminMessageDialog', () => {
  it('отправляет набранный текст', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    renderWidget(<AdminMessageDialog {...feedAdminMessageDialog()} onSend={onSend} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('пустой текст не отправляется', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    renderWidget(<AdminMessageDialog {...feedAdminMessageDialog()} value="   " onSend={onSend} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(onSend).not.toHaveBeenCalled()
  })

  it('показывает, почему сообщение не ушло', () => {
    renderWidget(
      <AdminMessageDialog {...feedAdminMessageDialog()} error="Покупатель заблокировал бота" />
    )

    expect(screen.getByText('Покупатель заблокировал бота')).toBeTruthy()
  })
})
