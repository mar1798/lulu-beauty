import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { Toast } from '.'
import { feedToast, feedToastWithAction } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Toast', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Toast {...feedToast()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('обратный ход срабатывает и закрывает уведомление', () => {
    const onAction = vi.fn()
    const onDismiss = vi.fn()
    const fixture = feedToastWithAction()

    renderWidget(
      <Toast
        toast={{ ...fixture.toast, action: { label: 'Вернуть', onAction } }}
        onDismiss={onDismiss}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }))

    expect(onAction).toHaveBeenCalledOnce()
    // Закрывается сразу: результат возврата приедет отдельным уведомлением.
    expect(onDismiss).toHaveBeenCalledWith(fixture.toast.id)
  })

  it('без действия рисуется только закрытие', () => {
    renderWidget(<Toast {...feedToast()} />)

    expect(screen.queryByRole('button', { name: 'Вернуть' })).toBeNull()
  })

  it('рисует иконку слева от текста и прячет её от скринридера', () => {
    const fixture = feedToast()

    const { container } = renderWidget(
      <Toast toast={{ ...fixture.toast, icon: <i data-testid="icon" /> }} onDismiss={() => {}} />
    )

    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild?.firstElementChild).toContainElement(
      screen.getByTestId('icon')
    )
  })

  it('без иконки обёртки под неё нет', () => {
    const { container } = renderWidget(<Toast {...feedToast()} />)

    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull()
  })
})
