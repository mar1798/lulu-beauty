import { createElement, type ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import useSWR, { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAdminChecklist } from 'widgets/types'
import { clearChecklistMarks, setChecklistMark } from '@/services/endpoints/admin'
import { type IChecklistMarks, useChecklistMarks } from './useChecklistMarks'

vi.mock('@/services/endpoints/admin', () => ({
  setChecklistMark: vi.fn(),
  clearChecklistMarks: vi.fn(),
}))

interface IDeferred {
  promise: Promise<void>
  resolve: () => void
  reject: (cause: unknown) => void
}

const deferred = (): IDeferred => {
  let resolve: () => void = () => undefined
  let reject: (cause: unknown) => void = () => undefined
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })

  return { promise, resolve, reject }
}

/** Что «лежит на сервере»: тест меняет его, как меняли бы запросы. */
let serverKeys: string[] = []

const fetchChecklist = vi.fn((): Promise<IAdminChecklist> =>
  Promise.resolve({
    cycle: { id: 'cycle-1', label: null, deadlineAt: '2030-01-01T00:00:00Z', isActive: true },
    items: [],
    checkedKeys: [...serverKeys],
  })
)

/** Свой кеш на тест и без дедупликации — иначе перечитывание сливалось бы с прошлым. */
const wrapper = ({ children }: { children: ReactNode }): ReactNode =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

const renderMarks = async (): Promise<{ current: IChecklistMarks }> => {
  const { result } = renderHook(
    (): IChecklistMarks => {
      const { data, mutate } = useSWR('checklist', fetchChecklist)

      return useChecklistMarks(data, mutate)
    },
    { wrapper }
  )

  await waitFor(() => {
    expect(fetchChecklist).toHaveBeenCalledTimes(1)
  })
  await act(async () => {})

  return result
}

beforeEach(() => {
  serverKeys = []
  fetchChecklist.mockClear()
  vi.mocked(setChecklistMark).mockReset()
  vi.mocked(clearChecklistMarks).mockReset()
})

afterEach(() => {
  cleanup()
})

describe('useChecklistMarks', () => {
  it('вторая отметка, пока первая в пути, не гасит первую', async () => {
    const first = deferred()
    const second = deferred()
    vi.mocked(setChecklistMark)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const result = await renderMarks()

    let firstDone: Promise<void> = Promise.resolve()
    let secondDone: Promise<void> = Promise.resolve()
    act(() => {
      firstDone = result.current.toggle('a', true)
    })
    act(() => {
      secondDone = result.current.toggle('b', true)
    })

    expect(result.current.checkedKeys).toEqual(['a', 'b'])

    // Первый ответ пришёл, пока второй ещё в пути: SWR его отбрасывает, а экран
    // при этом ничего не теряет.
    serverKeys = ['a']
    await act(async () => {
      first.resolve()
      await firstDone
    })
    expect(result.current.checkedKeys).toEqual(['a', 'b'])
    expect(fetchChecklist).toHaveBeenCalledTimes(1)

    serverKeys = ['a', 'b']
    await act(async () => {
      second.resolve()
      await secondDone
    })

    // Последний запрос в пути завершился — список перечитан один раз.
    await waitFor(() => {
      expect(fetchChecklist).toHaveBeenCalledTimes(2)
    })
    expect(result.current.checkedKeys).toEqual(['a', 'b'])
  })

  it('сорвавшаяся отметка среди нескольких исчезает, когда все дошли', async () => {
    const first = deferred()
    const second = deferred()
    vi.mocked(setChecklistMark)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const result = await renderMarks()

    let firstDone: Promise<void> = Promise.resolve()
    let secondDone: Promise<void> = Promise.resolve()
    act(() => {
      firstDone = result.current.toggle('a', true)
    })
    act(() => {
      secondDone = result.current.toggle('b', true)
    })

    // Не последняя из мутаций: отката от SWR тут не будет — только ошибка.
    await act(async () => {
      first.reject(new Error('offline'))
      await expect(firstDone).rejects.toThrow('offline')
    })

    serverKeys = ['b']
    await act(async () => {
      second.resolve()
      await secondDone
    })

    await waitFor(() => {
      expect(result.current.checkedKeys).toEqual(['b'])
    })
  })

  it('одиночная отметка, не дошедшая до сервера, снимается', async () => {
    vi.mocked(setChecklistMark).mockRejectedValueOnce(new Error('offline'))
    const result = await renderMarks()

    await act(async () => {
      await expect(result.current.toggle('a', true)).rejects.toThrow('offline')
    })

    expect(result.current.checkedKeys).toEqual([])
  })

  it('«Снять отметки» гасит всё сразу и сходится с сервером', async () => {
    serverKeys = ['a', 'b']
    const request = deferred()
    vi.mocked(clearChecklistMarks).mockReturnValueOnce(request.promise)
    const result = await renderMarks()
    expect(result.current.checkedKeys).toEqual(['a', 'b'])

    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.reset()
    })
    expect(result.current.checkedKeys).toEqual([])
    expect(clearChecklistMarks).toHaveBeenCalledWith('cycle-1')

    serverKeys = []
    await act(async () => {
      request.resolve()
      await done
    })

    await waitFor(() => {
      expect(fetchChecklist).toHaveBeenCalledTimes(2)
    })
    expect(result.current.checkedKeys).toEqual([])
  })
})
