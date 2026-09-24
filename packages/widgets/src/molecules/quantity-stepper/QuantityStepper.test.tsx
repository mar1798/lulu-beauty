import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { QuantityStepper } from '.'
import { feedQuantityStepper } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('QuantityStepper', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<QuantityStepper {...feedQuantityStepper()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('с `min = 0` шаг вниз с единицы доходит до нуля - позицию так убирают', () => {
    const onChange = vi.fn()

    renderWidget(
      <QuantityStepper value={1} min={0} onChange={onChange} decreaseLabel="Убрать из корзины" />
    )
    // В доступное имя кнопки входит и видимый знак «−», и скрытая подпись.
    fireEvent.click(screen.getByRole('button', { name: /Убрать из корзины/ }))

    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('по умолчанию ниже единицы не опускается', () => {
    const onChange = vi.fn()

    renderWidget(<QuantityStepper value={1} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Уменьшить количество/ }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
