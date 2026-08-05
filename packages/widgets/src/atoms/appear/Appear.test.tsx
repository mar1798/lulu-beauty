import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Appear } from '.'
import { feedAppear } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('Appear', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Appear {...feedAppear()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Главное свойство обёртки: анимация — это оформление, содержимое обязано
    быть в разметке сразу. Иначе скринридер и поисковик увидели бы пустоту.
  */
  it('отдаёт содержимое сразу, не дожидаясь анимации', () => {
    renderWidget(<Appear>Заявок пока нет</Appear>)

    expect(screen.getByText('Заявок пока нет')).toBeInTheDocument()
  })

  /*
    Смена `appearKey` пересоздаёт узел — только так `initial` проигрывается
    заново там, где содержимое подменяется без размонтирования.
  */
  it('пересоздаёт узел на смену appearKey и сохраняет его без неё', () => {
    const { container, rerender } = renderWidget(<Appear appearKey="a">Текст</Appear>)
    const first = container.firstElementChild

    rerender(<Appear appearKey="a">Текст</Appear>)
    expect(container.firstElementChild).toBe(first)

    rerender(<Appear appearKey="b">Текст</Appear>)
    expect(container.firstElementChild).not.toBe(first)
  })
})
