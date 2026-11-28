import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CartTemplate } from '.'
import { feedCartTemplate } from '../../stories/feed'
import { renderWidget } from '../../testing/render'
import * as styles from './CartTemplate.css'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CartTemplate', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<CartTemplate {...feedCartTemplate()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('titleDecor стоит в одном ряду с заголовком', () => {
    renderWidget(<CartTemplate {...feedCartTemplate()} titleDecor={<i data-testid="decor" />} />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.parentElement).toContainElement(screen.getByTestId('decor'))
  })

  it('без titleDecor в ряду только заголовок', () => {
    renderWidget(<CartTemplate {...feedCartTemplate()} />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.parentElement?.children).toHaveLength(1)
  })

  it('decor кладётся в отдельный слой блока заголовка, скрытый от скринридера', () => {
    renderWidget(<CartTemplate {...feedCartTemplate()} decor={<i data-testid="decor" />} />)

    const layer = screen.getByTestId('decor').parentElement as HTMLElement
    expect(layer).toHaveClass(styles.decor)
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer.parentElement).toContainElement(screen.getByRole('heading', { level: 1 }))
  })

  it('без decor слоя нет', () => {
    const { container } = renderWidget(<CartTemplate {...feedCartTemplate()} />)

    expect(container.querySelector(`.${styles.decor}`)).toBeNull()
  })
})
