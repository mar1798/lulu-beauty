import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './ToastContext'
import { renderWidget } from '../testing/render'

/**
 * Проверяется одно: отсчёт до автозакрытия. Всё остальное в провайдере —
 * тонкая обёртка над `ToastViewport`, у которого свои тесты.
 *
 * Тост с обратным ходом живёт считанные секунды, и «Вернуть» обязано дождаться
 * того, кто к нему тянется: пока курсор на стопке или в ней фокус, таймер
 * стоит. Время здесь поддельное — иначе тест ждал бы вживую десять секунд.
 *
 * Закрытие считается по `toasts`, а не по исчезновению узла: уезжает тост
 * анимацией (`AnimatePresence`), и под поддельными часами кадры не идут — из
 * стопки он выбыл, а из DOM ещё нет.
 */

const Trigger: React.FC = () => {
  const { notify, toasts } = useToast()

  return (
    <>
      <button
        type="button"
        onClick={() => {
          notify({
            tone: 'warning',
            title: 'Товар убран',
            action: { label: 'Вернуть', onAction: vi.fn() },
          })
        }}
      >
        Убрать
      </button>

      <span data-testid="count">{toasts.length}</span>
    </>
  )
}

/** Сколько уведомлений в стопке — единственный надёжный признак закрытия. */
const count = (): string => screen.getByTestId('count').textContent ?? ''

const show = (): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: 'Убрать' }))

  return screen.getByText('Товар убран')
}

/** Прокрутка поддельного времени: таймеры закрывают тост, `Date.now` считает остаток. */
const wait = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/*
  `pointerOver`/`pointerOut`, а не `pointerEnter`/`pointerLeave`: React считает
  вход и выход сам — по паре over/out и общему предку, — а непосредственно
  посланный `pointerenter` до обработчика не доходит.
*/
const enter = (toast: HTMLElement): void => {
  fireEvent.pointerOver(toast)
}

const leave = (toast: HTMLElement): void => {
  fireEvent.pointerOut(toast, { relatedTarget: document.body })
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('закрывает уведомление с обратным ходом через 10 секунд', async () => {
    renderWidget(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )

    show()
    await wait(9000)
    expect(count()).toBe('1')

    await wait(1000)
    expect(count()).toBe('0')
  })

  it('под курсором отсчёт стоит, после ухода - продолжается', async () => {
    renderWidget(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )

    const toast = show()
    await wait(9000)

    enter(toast)
    // Десятая секунда прошла бы здесь — но отсчёт остановлен.
    await wait(60000)
    expect(count()).toBe('1')

    // Остатка было меньше секунды: после ухода курсора он растянут до `RESUME_MINIMUM`.
    leave(toast)
    await wait(900)
    expect(count()).toBe('1')

    await wait(100)
    expect(count()).toBe('0')
  })

  it('фокус внутри стопки держит уведомление так же, как курсор', async () => {
    renderWidget(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )

    show()

    const undo = screen.getByRole('button', { name: 'Вернуть' })

    act(() => {
      undo.focus()
    })
    await wait(60000)
    expect(count()).toBe('1')

    act(() => {
      undo.blur()
    })
    await wait(10000)
    expect(count()).toBe('0')
  })
})
