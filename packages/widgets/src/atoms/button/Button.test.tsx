import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '.'
import { feedButton } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Button', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Button {...feedButton()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  describe('unavailableReason', () => {
    it('оставляет кнопку в табуляции — иначе причину не увидеть с клавиатуры', () => {
      renderWidget(<Button unavailableReason="Сбор закрыт">В корзину</Button>)

      const button = screen.getByRole('button')

      expect(button).not.toBeDisabled()
      expect(button).toHaveAttribute('aria-disabled', 'true')
    })

    it('не пропускает клик', async () => {
      const onClick = vi.fn()
      renderWidget(
        <Button unavailableReason="Сбор закрыт" onClick={onClick}>
          В корзину
        </Button>
      )

      await userEvent.click(screen.getByRole('button'))

      expect(onClick).not.toHaveBeenCalled()
    })

    it('дописывает причину в доступное имя', () => {
      renderWidget(<Button unavailableReason="Сбор закрыт">В корзину</Button>)

      expect(screen.getByRole('button')).toHaveAccessibleName(/Сбор закрыт/)
    })

    it('снимает submit, чтобы форма не ушла мимо aria-disabled', () => {
      renderWidget(
        <Button type="submit" unavailableReason="Сбор закрыт">
          В корзину
        </Button>
      )

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
    })
  })
})
