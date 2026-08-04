import { type FC, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IPortalProps } from '../../types'

/**
 * Рендер вне текущего поддерева — база для Modal, Drawer и ToastViewport.
 *
 * До монтирования возвращает `null`: на сервере `document` нет, а рендер
 * портала при гидратации иначе разошёлся бы с серверной разметкой.
 * Своих стилей у портала нет — оформление задаёт содержимое.
 */
export const Portal: FC<IPortalProps> = ({ children, container }) => {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return null
  }

  return createPortal(children, container ?? document.body)
}
