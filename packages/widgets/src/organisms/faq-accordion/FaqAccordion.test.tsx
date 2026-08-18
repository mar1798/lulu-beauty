import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FaqAccordion } from '.'
import { feedFaqAccordion } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * У аккордеона проверяется именно доступность: он собран из кнопок вручную
 * (вместо `details`/`summary`), а значит `aria-expanded`, связь с панелью и
 * работа с клавиатуры держатся не на семантике тега, а на этом коде.
 */
describe('FaqAccordion', () => {
  it('рендерит вопрос кнопкой и начинает свёрнутым', () => {
    const feed = feedFaqAccordion()

    renderWidget(<FaqAccordion {...feed} />)

    for (const item of feed.items) {
      const trigger = screen.getByRole('button', { name: item.question })

      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText(item.answer)).toBeNull()
    }
  })

  it('раскрывает ответ по клику и связывает панель с кнопкой', async () => {
    const user = userEvent.setup()
    const feed = feedFaqAccordion()

    renderWidget(<FaqAccordion {...feed} />)

    const trigger = screen.getByRole('button', { name: feed.items[0].question })
    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const panel = screen.getByRole('region', { name: feed.items[0].question })

    expect(panel).toHaveTextContent(feed.items[0].answer)
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
  })

  /*
    Свёрнутая панель размонтируется, поэтому `aria-controls` обязан исчезать
    вместе с ней: ссылка на несуществующий id — битая ARIA-связь.
  */
  it('не оставляет aria-controls на несуществующую панель', async () => {
    const user = userEvent.setup()
    const feed = feedFaqAccordion()

    renderWidget(<FaqAccordion {...feed} defaultOpenIndex={0} />)

    const trigger = screen.getByRole('button', { name: feed.items[0].question })

    expect(trigger).toHaveAttribute('aria-controls')

    await user.click(trigger)

    expect(trigger).not.toHaveAttribute('aria-controls')
  })

  it('раскрывается с клавиатуры', async () => {
    const user = userEvent.setup()
    const feed = feedFaqAccordion()

    renderWidget(<FaqAccordion {...feed} />)

    const trigger = screen.getByRole('button', { name: feed.items[0].question })
    trigger.focus()

    expect(trigger).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('по умолчанию держит открытой одну строку', async () => {
    const user = userEvent.setup()
    const feed = feedFaqAccordion()

    renderWidget(<FaqAccordion {...feed} />)

    await user.click(screen.getByRole('button', { name: feed.items[0].question }))
    await user.click(screen.getByRole('button', { name: feed.items[1].question }))

    expect(screen.getByRole('button', { name: feed.items[0].question })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('с isMultiple держит открытыми несколько', async () => {
    const user = userEvent.setup()
    const feed = feedFaqAccordion()

    renderWidget(<FaqAccordion {...feed} isMultiple={true} />)

    await user.click(screen.getByRole('button', { name: feed.items[0].question }))
    await user.click(screen.getByRole('button', { name: feed.items[1].question }))

    expect(screen.getByRole('button', { name: feed.items[0].question })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})
