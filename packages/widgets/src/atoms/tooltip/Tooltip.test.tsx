import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Tooltip } from '.'
import { Button } from '../button'
import { feedTooltip } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('Tooltip', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Tooltip {...feedTooltip()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('оставляет триггер на месте', () => {
    renderWidget(
      <Tooltip content="Сейчас нет открытого сбора">
        <Button unavailableReason="Сейчас нет открытого сбора">В корзину</Button>
      </Tooltip>
    )

    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('прячет пузырь от скринридера — причину озвучивает сам триггер', () => {
    const { container } = renderWidget(
      <Tooltip content="Сейчас нет открытого сбора">
        <Button unavailableReason="Сейчас нет открытого сбора">В корзину</Button>
      </Tooltip>
    )

    // `getByRole` тут бесполезен: `aria-hidden` — ровно то, что проверяется.
    const bubble = container.querySelector('[role="tooltip"]')

    expect(bubble).not.toBeNull()
    expect(bubble).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button')).toHaveAccessibleName(/нет открытого сбора/i)
  })
})
