import type { ILinkedLabel } from 'widgets/types'

/** Разделы личного кабинета — общие для «Моих заявок» и профиля. */
export const ACCOUNT_NAVIGATION: ILinkedLabel[] = [
  { label: 'Мои заявки', link: { href: '/orders' } },
  { label: 'Профиль', link: { href: '/account' } },
]
