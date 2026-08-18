import { describe, expect, it } from 'vitest'
import { Reveal } from '.'
import { feedReveal } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * `Reveal` прячет содержимое до входа в вьюпорт, поэтому цена ошибки —
 * навсегда невидимый блок. Проверяем, что содержимое всегда в разметке (а
 * значит доступно скринридеру и поиску) и что обёртка умеет быть элементом
 * списка: иначе `ul > div > li` ломает семантику там, где её и заводили.
 */
describe('Reveal', () => {
  it('всегда держит содержимое в разметке', () => {
    const { container } = renderWidget(<Reveal {...feedReveal()} />)

    expect(container.textContent).toBe(feedReveal().children)
  })

  it('рендерит тот тег, который просили', () => {
    const { container } = renderWidget(
      <Reveal as="li">
        <span>Пункт</span>
      </Reveal>,
    )

    expect(container.firstElementChild?.tagName).toBe('LI')
  })

  it('не съедает класс вызывающего', () => {
    const { container } = renderWidget(<Reveal className="outer">Текст</Reveal>)

    expect(container.firstElementChild).toHaveClass('outer')
  })
})
