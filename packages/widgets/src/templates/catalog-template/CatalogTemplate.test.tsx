import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CatalogTemplate } from '.'
import { feedCatalogTemplate } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CatalogTemplate', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<CatalogTemplate {...feedCatalogTemplate()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('показывает слот `aside` в шапке - рядом с заголовком, а не под сеткой', () => {
    renderWidget(<CatalogTemplate {...feedCatalogTemplate()} aside="Таймер" />)

    const heading = screen.getByRole('heading', { level: 1 })
    const aside = screen.getByText('Таймер')

    // Общий родитель — шапка: таймер стоит в одной строке с заголовком.
    expect(heading.closest('div')?.parentElement).toBe(aside.parentElement)
  })
})
