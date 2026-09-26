import { describe, expect, it } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import type { FC } from 'react'
import { useBackDismiss } from './useBackDismiss'

const Overlay: FC<{ isOpen: boolean }> = ({ isOpen }) => {
  useBackDismiss(isOpen, () => undefined)

  return null
}

const stateKey = (): unknown => (window.history.state as { key?: unknown } | null)?.key

describe('useBackDismiss', () => {
  /*
    Саму гонку `back()` с `pushState` jsdom не воспроизводит — очередь переходов у
    него своя, и тест проходит и без очереди в `installSkipper`. Он сторожит итог:
    новая страница на месте, а под ней — исходная, без записи оверлея.
  */
  it('переход кодом сразу после закрытия не теряется', async () => {
    window.history.replaceState({ key: 'a' }, '', '/a')

    const { rerender } = render(<Overlay isOpen={true} />)

    // Закрыли не ссылкой — запись снимается `back()`, а роутер уже кладёт новую.
    rerender(<Overlay isOpen={false} />)
    window.history.pushState({ key: 'b' }, '', '/b')

    await waitFor(() => expect(window.location.pathname).toBe('/b'))
    expect(stateKey()).toBe('b')

    // Под новой страницей — исходная, а не запись закрытого оверлея.
    window.history.back()

    await waitFor(() => expect(window.location.pathname).toBe('/a'))
    expect(stateKey()).toBe('a')
  })

  it('осиротевшую запись пролистывает в сторону движения', async () => {
    window.history.replaceState({ key: 'c' }, '', '/c')

    const { rerender, container } = render(<Overlay isOpen={true} />)

    // Закрытие кликом по ссылке: запись оверлея остаётся под новой страницей.
    const link = document.createElement('a')
    link.href = '/d'
    link.addEventListener('click', event => event.preventDefault())
    container.append(link)
    fireEvent.click(link)
    rerender(<Overlay isOpen={false} />)
    window.history.pushState({ key: 'd' }, '', '/d')

    window.history.back()
    await waitFor(() => expect(stateKey()).toBe('c'))
    expect((window.history.state as Record<string, unknown>).__overlay).toBeUndefined()

    // Вперёд — через ту же запись до конца, а не обратно.
    window.history.forward()
    await waitFor(() => expect(window.location.pathname).toBe('/d'))
    expect(stateKey()).toBe('d')
  })
})
