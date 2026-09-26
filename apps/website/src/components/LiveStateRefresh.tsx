import type React from 'react'
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn'

/** Ничего не рисует — держит `useRefreshOnReturn` внутри `SWRConfig` на всех страницах. */
export const LiveStateRefresh: React.FC = () => {
  useRefreshOnReturn()

  return null
}
