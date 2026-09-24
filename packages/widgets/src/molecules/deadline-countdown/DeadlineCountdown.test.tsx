import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadlineCountdown } from '.'
import { feedDeadlineCountdown } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

const NOW = new Date('2026-08-04T12:00:00.000Z')

const inFuture = (ms: number): string => new Date(NOW.getTime() + ms).toISOString()

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('DeadlineCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<DeadlineCountdown {...feedDeadlineCountdown()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Секунды идут на любом остатке, а не только на последнем часе: иначе на
    границе часа раскладка скакала бы — в строке прибавлялось слово, в панели
    героя появлялся четвёртый блок.
  */
  it('показывает секунды и на остатке в двое суток', () => {
    const { container } = renderWidget(
      <DeadlineCountdown
        deadlineAt={inFuture(2 * 24 * 3600_000 + 3 * 3600_000 + 4 * 60_000 + 5000)}
      />
    )

    expect(container.textContent).toContain('2 д 03 ч 04 мин 05 с')
  })

  it('в варианте `blocks` секунды - всегда четвёртый блок', () => {
    const { container } = renderWidget(
      <DeadlineCountdown
        deadlineAt={inFuture(2 * 24 * 3600_000)}
        variant="blocks"
        isLabelHidden={true}
      />
    )

    expect(container.textContent).toContain('сек')
  })
})
