import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { StepList } from '.'
import { feedStepList } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('StepList', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<StepList {...feedStepList()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Порядок шагов несёт смысл, поэтому это `<ol>`, а не набор карточек:
    скринридер должен объявить «список из трёх пунктов, пункт 1».
  */
  it('нумерует шаги списком, а не набором блоков', () => {
    renderWidget(<StepList {...feedStepList()} />)

    const list = screen.getByRole('list')

    expect(list.tagName).toBe('OL')
    expect(screen.getAllByRole('listitem')).toHaveLength(feedStepList().steps.length)
  })

  /* Номер нарисован, а не прочитан: иначе он прозвучал бы вторым «один». */
  it('прячет нарисованный номер от скринридера', () => {
    renderWidget(<StepList {...feedStepList()} />)

    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'true')
  })
})
