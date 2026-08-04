import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Portal } from '.'
import { feedPortal } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Общий smoke-тест из шаблона тут не годится: портал по определению
 * рендерит мимо своего контейнера. Проверяем, что содержимое доехало до
 * `document.body`, а на месте вызова ничего не осталось.
 */
describe('Portal', () => {
  it('рендерит содержимое вне своего поддерева', () => {
    const { container } = renderWidget(<Portal {...feedPortal()} />)

    expect(container.firstElementChild).toBeNull()
    expect(screen.getByText('Содержимое портала')).toBeInTheDocument()
  })

  it('уважает переданный контейнер', () => {
    const target = document.createElement('div')

    document.body.append(target)
    renderWidget(<Portal container={target}>цель</Portal>)

    expect(target).toHaveTextContent('цель')
  })
})
