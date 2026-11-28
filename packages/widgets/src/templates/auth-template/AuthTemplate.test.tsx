import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { AuthTemplate } from '.'
import { feedAuthTemplate } from '../../stories/feed'
import * as styles from './AuthTemplate.css'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AuthTemplate', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AuthTemplate {...feedAuthTemplate()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('decor кладётся в отдельный слой, скрытый от скринридера', () => {
    renderWidget(<AuthTemplate {...feedAuthTemplate()} decor={<i data-testid="decor" />} />)

    const layer = screen.getByTestId('decor').parentElement as HTMLElement
    expect(layer).toHaveClass(styles.decor)
    expect(layer).toHaveAttribute('aria-hidden', 'true')
  })

  it('без decor слоя нет', () => {
    const { container } = renderWidget(<AuthTemplate {...feedAuthTemplate()} />)

    expect(container.querySelector(`.${styles.decor}`)).toBeNull()
  })
})
