import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '.'
import { feedModal } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Общий smoke-тест из шаблона тут не годится: модалка рендерится порталом,
 * то есть заведомо мимо своего контейнера. Проверяем то, ради чего компонент
 * и нужен, — роль диалога с именем и три способа закрытия.
 */
describe('Modal', () => {
  it('рендерит диалог с доступным именем вне своего поддерева', () => {
    const { container } = renderWidget(<Modal {...feedModal()} />)

    expect(container.firstElementChild).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Удалить товар?' })).toBeInTheDocument()
  })

  it('не рендерит ничего, пока закрыт', () => {
    renderWidget(<Modal {...feedModal()} isOpen={false} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('закрывается крестиком и по Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    renderWidget(<Modal {...feedModal()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('клик мимо окна закрывает только когда это разрешено', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    const { rerender } = renderWidget(
      <Modal {...feedModal()} isDismissable={false} onClose={onClose} />
    )

    // Фон — родитель самого диалога.
    const overlay = (): HTMLElement => screen.getByRole('dialog').parentElement as HTMLElement

    await user.click(overlay())
    expect(onClose).not.toHaveBeenCalled()

    rerender(<Modal {...feedModal()} isDismissable={true} onClose={onClose} />)
    await user.click(overlay())
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('забирает фокус внутрь, когда открыт уже при монтировании', async () => {
    /*
      Портал возвращает `null` до своего эффекта, поэтому на первом коммите
      диалога в DOM ещё нет. Ловушка фокуса не должна на этом сдаваться:
      именно так модалку и открывают — `isOpen` уже `true` в момент вставки.
    */
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    renderWidget(<Modal {...feedModal()} />)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    trigger.remove()
  })
})
