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
    Прошедший сбор менять нечему: заявки в нём посчитаны и разосланы, а удаление
    стёрло бы историю. Кнопки, которые почти всегда кончались бы отказом бэкенда,
    только приглашают ошибиться — поэтому их нет вовсе.
  */
  it('оставляет прошедший сбор только для чтения', async () => {
    const props = feedAdminCycleCalendar()

    renderWidget(
      <AdminCycleCalendar
        {...props}
        month="2026-03"
        today="2026-04-01"
        activeCycleId={null}
        cycles={[
          {
            id: 'closed',
            /* 20:00 по магазину (`Asia/Bishkek`, UTC+6) 10 марта. */
            deadlineAt: '2026-03-10T14:00:00.000Z',
            label: 'Сбор на март',
            status: 'CLOSED',
            reminderSentAt: null,
            finalReminderSentAt: null,
            closedAt: '2026-03-10T14:00:00.000Z',
          },
        ]}
      />
    )
    await clickDay(10)

    for (const name of ['Сохранить', 'Назначить сбор', 'Удалить', 'Закрыть сейчас']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }

    expect(screen.queryByLabelText('Время закрытия')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Подпись')).not.toBeInTheDocument()
    /* Величины сбора при этом видны — строка читается, просто не правится. */
    const [time, label] = screen.getAllByRole('definition')

    expect(time).toHaveTextContent('20:00')
    expect(label).toHaveTextContent('Сбор на март')
  })

  /*
    Владелец приходит сюда за сегодняшним днём чаще, чем за любым другим, —
    и до правки ему приходилось начинать с клика по нему же.
  */
  it('открывается на сегодняшнем дне со сбором, который на нём стоит', () => {
    const props = feedAdminCycleCalendar()
    const { rerender } = renderWidget(
      <AdminCycleCalendar
        {...props}
        month="2026-03"
        today="2026-03-10"
        cycles={[]}
        activeCycleId={null}
        isLoading={true}
      />
    )

    expect(screen.getByRole('heading', { name: /10 марта/ })).toBeInTheDocument()

    /* Сборы приезжают позже монтирования — черновик обязан их догнать. */
    rerender(
      <AdminCycleCalendar
        {...props}
        month="2026-03"
        today="2026-03-10"
        activeCycleId="active"
        cycles={[
          {
            id: 'active',
            /* 18:30 по магазину (`Asia/Bishkek`, UTC+6) 10 марта. */
            deadlineAt: '2026-03-10T12:30:00.000Z',
            label: 'Сбор на март',
            status: 'ACTIVE',
            reminderSentAt: null,
            finalReminderSentAt: null,
            closedAt: null,
          },
        ]}
      />
    )

    expect(screen.getByLabelText('Время закрытия')).toHaveValue('18:30')
    expect(screen.getByLabelText('Подпись')).toHaveValue('Сбор на март')
  })

  /* В другом месяце «сегодня» не показано — подставлять его в редактор нечего. */
  it('не подставляет сегодняшний день, когда листается другой месяц', () => {
    const props = feedAdminCycleCalendar()

    renderWidget(<AdminCycleCalendar {...props} month="2026-05" today="2026-03-10" cycles={[]} />)

    expect(screen.getByText(/Выберите день в календаре/)).toBeInTheDocument()
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
