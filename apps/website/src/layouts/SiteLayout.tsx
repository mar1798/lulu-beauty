import React from 'react'
import { useRouter } from 'next/router'
import type { IFooterColumn, ILinkedLabel } from 'widgets/types'
import { Footer, Header } from 'widgets/organisms'
import { BaseLayout } from 'widgets/templates'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'

/**
 * Каркас публичных страниц: шапка и подвал, настроенные данными сайта.
 *
 * `BaseLayout` и `Header`/`Footer` из `widgets` презентационные, поэтому
 * навигация, текущий пользователь и адреса живут здесь.
 */

const NAVIGATION: ILinkedLabel[] = [
  { label: 'Каталог', link: { href: '/catalog' } },
  { label: 'Мои заявки', link: { href: '/orders' } },
]

const FOOTER_COLUMNS: IFooterColumn[] = [
  {
    title: 'Магазин',
    links: [
      { label: 'Каталог', link: { href: '/catalog' } },
      { label: 'Мои заявки', link: { href: '/orders' } },
    ],
  },
  {
    title: 'Аккаунт',
    links: [
      { label: 'Вход', link: { href: '/login' } },
      { label: 'Регистрация', link: { href: '/register' } },
    ],
  },
]

const START_YEAR = 2026

/**
 * Раздел верхнего уровня для подсветки активного пункта: у страницы товара
 * путь `/catalog/[slug]`, и точное сравнение с `/catalog` его бы не поймало.
 */
const sectionOf = (path: string): string => {
  const [, section = ''] = path.split('?')[0].split('/')

  return `/${section}`
}

export const SiteLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter()
  const { user } = useAuth()
  const { itemCount } = useCart()

  return (
    <BaseLayout
      header={
        <Header
          logo={{ label: 'Lulu Beauty', link: { href: '/' } }}
          navigation={NAVIGATION}
          cartLink={{ href: '/cart' }}
          cartCount={itemCount}
          user={user === null ? null : { name: user.name, link: { href: '/account' } }}
          loginLink={{ href: '/login' }}
          currentHref={sectionOf(router.asPath)}
        />
      }
      footer={
        <Footer
          columns={FOOTER_COLUMNS}
          copyright={`© ${START_YEAR} Lulu Beauty`}
          note="Оплата и доставка обсуждаются лично"
        />
      }
    >
      {children}
    </BaseLayout>
  )
}
