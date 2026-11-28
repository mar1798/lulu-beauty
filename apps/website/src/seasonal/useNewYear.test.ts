// Запуск: npx vitest run src/seasonal/useNewYear.test.ts
import React, { act } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeaderGarland } from './NewYear'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('useNewYear', () => {
  afterEach(() => {
    delete process.env.NEW_YEAR_DECOR
    document.documentElement.removeAttribute('data-newyear')
  })

  it('на сервере декора нет, даже когда режим on', () => {
    process.env.NEW_YEAR_DECOR = 'on'
    document.documentElement.setAttribute('data-newyear', '')
    expect(renderToString(React.createElement(HeaderGarland))).toBe('')
  })

  it('при гидрации серверной разметки нет ошибок, а декор появляется после неё', async () => {
    // сезон задаёт атрибут от раннего скрипта, а не дата и не часовой пояс машины
    process.env.NEW_YEAR_DECOR = 'on'
    document.documentElement.setAttribute('data-newyear', '')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onRecoverableError = vi.fn()
    const container = document.createElement('div')
    // как приходит HTML от сервера: без декора
    container.innerHTML = renderToString(React.createElement(HeaderGarland))
    expect(container.querySelector('.ny-garland')).toBeNull()

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, React.createElement(HeaderGarland), { onRecoverableError })
    })

    expect(onRecoverableError).not.toHaveBeenCalled()
    const hydrationErrors = consoleError.mock.calls.filter(call =>
      call.some(arg => /hydrat/i.test(String(arg)))
    )
    expect(hydrationErrors).toEqual([])
    expect(container.querySelector('.ny-garland')).not.toBeNull()

    await act(async () => root?.unmount())
    consoleError.mockRestore()
  })

  it('в браузере при off декора нет', async () => {
    process.env.NEW_YEAR_DECOR = 'off'
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(React.createElement(HeaderGarland)))
    expect(container.querySelector('.ny-garland')).toBeNull()
    await act(async () => root.unmount())
  })

  it('без атрибута на <html> декора нет, даже когда режим on', async () => {
    process.env.NEW_YEAR_DECOR = 'on'
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(React.createElement(HeaderGarland)))
    expect(container.querySelector('.ny-garland')).toBeNull()
    await act(async () => root.unmount())
  })

  it('с атрибутом на <html> декор есть в браузере', async () => {
    document.documentElement.setAttribute('data-newyear', '')
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(React.createElement(HeaderGarland)))
    expect(container.querySelector('.ny-garland')).not.toBeNull()
    await act(async () => root.unmount())
  })
})
