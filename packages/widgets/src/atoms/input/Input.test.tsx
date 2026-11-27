import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from '.'
import { feedInput } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Input', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Input {...feedInput()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('пустая дата помечена data-empty: Safari иначе рисует в ней сегодняшнее число', () => {
    const { rerender } = renderWidget(
      <Input label="Конец, дата" type="date" value="" onChange={() => undefined} />
    )

    expect(screen.getByLabelText('Конец, дата')).toHaveAttribute('data-empty', 'true')

    rerender(
      <Input label="Конец, дата" type="date" value="2026-12-01" onChange={() => undefined} />
    )

    expect(screen.getByLabelText('Конец, дата')).not.toHaveAttribute('data-empty')
  })
})
