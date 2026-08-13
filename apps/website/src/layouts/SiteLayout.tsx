import React, { useMemo } from 'react'
import { useRouter } from 'next/router'
import type { IFooterColumn, ILinkedLabel } from 'widgets/types'
import { Footer, Header, MobileMenu } from 'widgets/organisms'
import { useDisclosure } from 'widgets/hooks'
import { BaseLayout } from 'widgets/templates'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { usePrefetchRoutes } from '@/hooks/usePrefetchRoutes'

/**
 * Каркас публичных страниц: шапка и подвал, настроенные данными сайта.
 *
 * `BaseLayout` и `Header`/`Footer` из `widgets` презентационные, поэтому
 * навигация, текущий пользователь и адреса живут здесь.
 */

const NAVIGATION: ILinkedLabel[] = [
  { label: 'Каталог', link: { href: '/catalog' } },
  { label: 'Избранное', link: { href: '/wishlist' } },
  { label: 'Мои заявки', link: { href: '/orders' } },
]

/** Виден только владельцу: у покупателя `/admin/*` всё равно закрыт SSR-гейтом. */
const ADMIN_LINK: ILinkedLabel = { label: 'Админка', link: { href: '/admin' } }

const SHOP_COLUMN: IFooterColumn = {
  title: 'Магазин',
  links: [
    { label: 'Каталог', link: { href: '/catalog' } },
    { label: 'Избранное', link: { href: '/wishlist' } },
    { label: 'Мои заявки', link: { href: '/orders' } },
  ],
}

/**
 * Колонка «Аккаунт» зависит от сессии: вошедшему «Вход» и «Регистрация» не
 * нужны (и сбивают с толку — выглядят как приглашение завести второй аккаунт),
 * гостю бесполезен «Профиль» — он всё равно упрётся в редирект на вход.
 */
const accountColumn = (isAuthorized: boolean): IFooterColumn => ({
  title: 'Аккаунт',
  links: isAuthorized
    ? [{ label: 'Профиль', link: { href: '/account' } }]
    // Регистрации как страницы больше нет: аккаунт заводится в боте на первом
    // же входе, поэтому «Вход» — единственная ссылка, которая гостю что-то даёт.
    : [{ label: 'Вход', link: { href: '/login' } }],
})

const START_YEAR = 2026

/**
 * Куда уходят из шапки чаще всего — эти маршруты подгружаются заранее, на
 * простое браузера (см. `usePrefetchRoutes`: сам Next 16 этого уже не делает).
 *
 * Оба списка — константы уровня модуля: хук сравнивает массив по ссылке.
 * Гостю незачем греть корзину и заявки — он упрётся в редирект на вход.
 */
const GUEST_PREFETCH = ['/catalog', '/login'] as const
const USER_PREFETCH = ['/catalog', '/orders', '/cart', '/wishlist'] as const

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
  const { user, isAdmin } = useAuth()
  const { itemCount } = useCart()
  const menu = useDisclosure()

  usePrefetchRoutes(user === null ? GUEST_PREFETCH : USER_PREFETCH)

  const navigation = useMemo<ILinkedLabel[]>(
    () => (isAdmin ? [...NAVIGATION, ADMIN_LINK] : NAVIGATION),
    [isAdmin]
  )

  const currentHref = sectionOf(router.asPath)
  const headerUser = user === null ? null : { name: user.name, link: { href: '/account' } }

  const footerColumns = useMemo<IFooterColumn[]>(
    () => [SHOP_COLUMN, accountColumn(user !== null)],
    [user]
  )

  return (
    <BaseLayout
      header={
        <>
          <Header
            logo={{ label: 'Lulu Beauty', link: { href: '/' } }}
            navigation={navigation}
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
            navigation={navigation}
            user={headerUser}
            loginLink={{ href: '/login' }}
            cartLink={{ href: '/cart' }}
            cartCount={itemCount}
            currentHref={currentHref}
          />
        </>
      }
      footer={
        <Footer
          columns={footerColumns}
          copyright={`© ${START_YEAR} Lulu Beauty`}
          note="Оплата и доставка обсуждаются лично"
        />
      }
    >
      {children}
    </BaseLayout>
  )
}
