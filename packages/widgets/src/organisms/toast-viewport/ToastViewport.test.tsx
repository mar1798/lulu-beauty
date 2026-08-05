import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastViewport } from '.'
import { feedToastViewport } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Как и у модалки, стандартный smoke-тест не годится — стопка рендерится
 * порталом. Проверяем главное: все уведомления видны, ошибка объявляется
 * скринридером немедленно (`alert`), остальные — деликатно (`status`),
 * и закрытие отдаёт наверх идентификатор именно того тоста, по которому кликнули.
 */
describe('ToastViewport', () => {
  it('показывает все уведомления вне своего поддерева', () => {
    const { container } = renderWidget(<ToastViewport {...feedToastViewport()} />)

    expect(container.firstElementChild).toBeNull()
    expect(screen.getByText('Товар сохранён')).toBeInTheDocument()
    expect(screen.getByText('Фотография загружена')).toBeInTheDocument()
    expect(screen.getByText('Не удалось удалить сбор')).toBeInTheDocument()
  })

  it('ошибку объявляет как alert, остальное — как status', () => {
    renderWidget(<ToastViewport {...feedToastViewport()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось удалить сбор')
    expect(screen.getAllByRole('status')).toHaveLength(2)
  })

  it('закрывает именно тот тост, по которому нажали', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()

    renderWidget(<ToastViewport {...feedToastViewport()} onDismiss={onDismiss} />)

    await user.click(screen.getAllByRole('button', { name: 'Скрыть уведомление' })[1])

    expect(onDismiss).toHaveBeenCalledWith('toast-2')
  })
})
