import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminCycleCalendar } from '.'
import { feedAdminCycleCalendar } from '../../stories/feed'
import { toStoreParts } from '../../utils/datetime'
import { renderWidget } from '../../testing/render'

/**
 * Клетка календаря по числу месяца. Не `getByRole('button', { name })`: у клетки,
 * где стоит сбор, в доступное имя входит ещё и подпись дедлайна.
 */
const clickDay = async (day: number): Promise<void> => {
  const cell = screen
    .getAllByRole('button')
    .find(button => button.textContent?.startsWith(String(day)) === true)

  await userEvent.click(cell as HTMLElement)
}

/** Число месяца, на котором стоит идущий сейчас сбор. */
const activeDay = (props: ReturnType<typeof feedAdminCycleCalendar>): number => {
  const active = props.cycles.find(cycle => cycle.id === props.activeCycleId)

  return Number(toStoreParts(active?.deadlineAt ?? '')?.date.slice(-2))
}

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AdminCycleCalendar', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminCycleCalendar {...feedAdminCycleCalendar()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('предлагает закрыть досрочно только тот сбор, который сейчас идёт', async () => {
    const props = feedAdminCycleCalendar()
    const onClose = vi.fn()

    renderWidget(<AdminCycleCalendar {...props} onClose={onClose} />)
    await clickDay(activeDay(props))
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть сейчас' }))

    expect(onClose).toHaveBeenCalledWith(props.cycles[0])
  })

  /*
    Второй открытый сбор бэкенд не заведёт (`active_cycle_exists`), а на экране это
    выглядело бы как «нажал и ничего»: причина должна стоять рядом с кнопкой.
  */
  it('не даёт назначить второй сбор, пока открыт первый', async () => {
    const props = feedAdminCycleCalendar()
    const onCreate = vi.fn()
    /* Свободный день: сборы фикстуры стоят через 3 и 20 дней от сегодня. */
    const freeDay = activeDay(props) === 1 ? 2 : 1

    renderWidget(<AdminCycleCalendar {...props} onCreate={onCreate} />)
    await clickDay(freeDay)
    await userEvent.click(screen.getByRole('button', { name: /Назначить сбор/ }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getAllByText(/Открытый сбор уже есть/).length).toBeGreaterThan(0)
  })
})
