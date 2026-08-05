import React from 'react'
import { useRouter } from 'next/router'
import type { IFooterColumn, ILinkedLabel } from 'widgets/types'
import { Footer, Header, MobileMenu } from 'widgets/organisms'
import { useDisclosure } from 'widgets/hooks'
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
      { label: 'Профиль', link: { href: '/account' } },
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
  const menu = useDisclosure()

  const currentHref = sectionOf(router.asPath)
  const headerUser = user === null ? null : { name: user.name, link: { href: '/account' } }

  return (
    <BaseLayout
      header={
        <>
          <Header
            logo={{ label: 'Lulu Beauty', link: { href: '/' } }}
            navigation={NAVIGATION}
            cartLink={{ href: '/cart' }}
            cartCount={itemCount}
            user={headerUser}
            loginLink={{ href: '/login' }}
            currentHref={currentHref}
            onMenuClick={menu.open}
          />

          {/*
            Панель рендерится порталом в конец `body`, поэтому лежать внутри
            шапки ей ничто не мешает: `position: sticky` шапки её не обрежет.
          */}
          <MobileMenu
            isOpen={menu.isOpen}
            onClose={menu.close}
            navigation={NAVIGATION}
            user={headerUser}
            loginLink={{ href: '/login' }}
            registerLink={{ href: '/register' }}
            cartLink={{ href: '/cart' }}
            cartCount={itemCount}
            currentHref={currentHref}
          />
        </>
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
