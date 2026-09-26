import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { type FC, type ReactNode, useLayoutEffect } from 'react'
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
      </Reveal>
    )

    expect(container.firstElementChild?.tagName).toBe('LI')
  })

  it('не съедает класс вызывающего', () => {
    const { container } = renderWidget(<Reveal className="outer">Текст</Reveal>)

    expect(container.firstElementChild).toHaveClass('outer')
  })

  describe('после восстановления прокрутки', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    /*
      Корень Next выставляет прокрутку («назад», `scrollRestoration`) в своём
      layout-эффекте — уже после эффектов детей. Здесь это родитель, который
      «прокручивает» страницу: до него блок за экраном, после — на экране.
    */
    const ScrollingRoot: FC<{ children: ReactNode; onScroll: () => void }> = ({
      children,
      onScroll,
    }) => {
      useLayoutEffect(onScroll, [onScroll])

      return <>{children}</>
    }

    it('не прячет блок, который после прокрутки стоит на экране', async () => {
      let isScrolled = false

      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => {
        const top = isScrolled ? 100 : window.innerHeight + 500

        return { top, bottom: top + 200 } as DOMRect
      })

      const { container } = renderWidget(
        <ScrollingRoot
          onScroll={() => {
            isScrolled = true
          }}
        >
          <Reveal>Текст</Reveal>
        </ScrollingRoot>
      )
      const node = container.firstElementChild as HTMLElement

      // Кадр, в котором `Reveal` решает, прятать ли блок.
      await new Promise(resolve => requestAnimationFrame(resolve))
      await waitFor(() => expect(node.style.opacity).not.toBe('0'))
    })
  })
})
