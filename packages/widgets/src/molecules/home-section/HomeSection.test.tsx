import { describe, expect, it } from 'vitest'
import { HomeSection } from '.'
import { feedHomeSection } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('HomeSection', () => {
  it('рендерит секцию с содержимым', () => {
    const { container } = renderWidget(<HomeSection {...feedHomeSection()} />)
    const section = container.firstElementChild

    expect(section?.tagName).toBe('SECTION')
    expect(section).toHaveTextContent(String(feedHomeSection().children))
  })

  /*
    Слой пятен обязан стоять до контента: он `position: absolute`, и только
    порядок в разметке держит его за текстом.
  */
  it('ставит фоновый слот первым ребёнком, до контента', () => {
    const { container } = renderWidget(
      <HomeSection background={<div data-testid="decor" />}>Контент</HomeSection>,
    )

    expect(container.querySelector('section')?.firstElementChild).toHaveAttribute(
      'data-testid',
      'decor',
    )
  })

  it('без фонового слота лишнего узла не заводит', () => {
    const { container } = renderWidget(<HomeSection>Контент</HomeSection>)

    expect(container.querySelector('section')?.children).toHaveLength(1)
  })

  it('прокидывает id — по нему на секцию ссылаются якорем', () => {
    const { container } = renderWidget(<HomeSection id="faq">Контент</HomeSection>)

    expect(container.querySelector('section')).toHaveAttribute('id', 'faq')
  })
})
