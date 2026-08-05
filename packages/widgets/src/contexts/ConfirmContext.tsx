import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { IConfirmDialogProps } from '../types'
import { ConfirmDialog } from '../organisms/confirm-dialog'

/**
 * Императивное подтверждение опасных действий админки: удаление товара,
 * категории, сбора.
 *
 * `await confirm({...})` вместо ручного состояния «показать ли диалог» в
 * каждом экране: у админки таких действий много, и без общего механизма
 * каждая таблица тащила бы собственную модалку.
 *
 * Нативный `window.confirm` не годится: он блокирует поток, не стилизуется
 * и не переводится, а на мобильных браузерах показывает адрес страницы.
 */

export type IConfirmRequest = Pick<
  IConfirmDialogProps,
  'title' | 'description' | 'confirmLabel' | 'cancelLabel' | 'tone'
>

export interface IConfirmContextValue {
  confirm: (request: IConfirmRequest) => Promise<boolean>
}

const ConfirmContext = createContext<IConfirmContextValue | null>(null)

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [request, setRequest] = useState<IConfirmRequest | null>(null)
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const settle = useCallback((confirmed: boolean): void => {
    const resolve = resolveRef.current

    resolveRef.current = null
    setRequest(null)
    resolve?.(confirmed)
  }, [])

  const confirm = useCallback(
    (next: IConfirmRequest): Promise<boolean> => {
      // Второй запрос поверх первого — предыдущий отвечает «нет», иначе
      // его `await` повис бы навсегда.
      resolveRef.current?.(false)
      setRequest(next)

      return new Promise<boolean>(resolve => {
        resolveRef.current = resolve
      })
    },
    []
  )

  const value = useMemo<IConfirmContextValue>(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        isOpen={request !== null}
        title={request?.title ?? ''}
        description={request?.description}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        tone={request?.tone}
        onConfirm={() => {
          settle(true)
        }}
        onCancel={() => {
          settle(false)
        }}
      />
    </ConfirmContext.Provider>
  )
}

export const useConfirm = (): IConfirmContextValue => {
  const value = useContext(ConfirmContext)

  if (value === null) {
    throw new Error('useConfirm вызван вне <ConfirmProvider>')
  }

  return value
}
