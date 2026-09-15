import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Float } from '.'
import { feedFloat } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('Float', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Float {...feedFloat()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('отдаёт содержимое наружу как есть', () => {
    renderWidget(
      <Float>
        <button type="button">Кнопка внутри</button>
      </Float>
    )

    expect(screen.getByRole('button', { name: 'Кнопка внутри' })).toBeInTheDocument()
  })

  /*
    Смысл `phase` — развести соседей: одинаковая фаза свела бы кластер в один
    такт, и левитация читалась бы как дрожание всего блока целиком.
  */
  it('разводит соседей по фазе и периоду', () => {
    const { container } = renderWidget(
      <>
        <Float phase={0}>Первая</Float>
        <Float phase={0.5}>Вторая</Float>
      </>
    )

    const [first, second] = Array.from(container.children) as HTMLElement[]

    expect(first?.style.animationDelay).not.toBe(second?.style.animationDelay)
    expect(first?.style.animationDuration).not.toBe(second?.style.animationDuration)
  })
})
