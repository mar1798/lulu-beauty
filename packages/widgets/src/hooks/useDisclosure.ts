import { useCallback, useMemo, useState } from 'react'

/**
 * Открыто/закрыто для модалок, выпадашек и мобильного меню.
 *
 * Обработчики стабильны между рендерами (`useCallback`), иначе каждый рендер
 * родителя перерисовывал бы и содержимое модалки, которому они уходят пропсами.
 */

export interface IDisclosure {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const useDisclosure = (initial = false): IDisclosure => {
  const [isOpen, setIsOpen] = useState(initial)

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen(current => !current)
  }, [])

  return useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle])
}
