import type { ILinkedLabel } from 'widgets/types'

/** Разделы личного кабинета — общие для «Моих заявок», «Промокодов» и профиля. */
export const ACCOUNT_NAVIGATION: ILinkedLabel[] = [
  { label: 'Мои заявки', link: { href: '/orders' } },
  { label: 'Промокоды', link: { href: '/promocodes' } },
  { label: 'Профиль', link: { href: '/account' } },
]
