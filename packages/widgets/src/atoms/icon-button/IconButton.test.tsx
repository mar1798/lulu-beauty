import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from '.'
import { feedIconButton } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('IconButton', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<IconButton {...feedIconButton()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('с `unavailableReason` остаётся фокусируемой, но не кликается', async () => {
    const onClick = vi.fn()
    renderWidget(
      <IconButton
        icon="+"
        label="В корзину"
        unavailableReason="Сбор закрыт"
        onClick={onClick}
      />
    )

    const button = screen.getByRole('button')
    await userEvent.click(button)

    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleName('В корзину — Сбор закрыт')
    expect(onClick).not.toHaveBeenCalled()
  })
})
