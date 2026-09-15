import React, { useMemo } from 'react'
import { useRouter } from 'next/router'
import type { IFooterColumn, ILinkedLabel } from 'widgets/types'
import { Footer, Header, MobileMenu } from 'widgets/organisms'
import { useDisclosure } from 'widgets/hooks'
import { IconInstagram } from 'widgets/svg'
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

/** Виден только владельцу: покупателя `/admin/*` всё равно развернёт гейт (`useAdminGate`). */
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
 * Связаться с владельцем можно только вне сайта: своего мессенджера здесь нет,
 * и пока единственный публичный контакт — Instagram магазина. Ссылка внешняя,
 * поэтому открывается новой вкладкой (`rel` проставит адаптер `Link`).
 */
const CONTACTS_COLUMN: IFooterColumn = {
  title: 'Контакты',
  links: [
    {
      label: 'Instagram',
      icon: <IconInstagram />,
      link: { href: 'https://www.instagram.com/sululu_kg', target: '_blank' },
    },
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
    : // Регистрации как страницы больше нет: аккаунт заводится в боте на первом
      // же входе, поэтому «Вход» — единственная ссылка, которая гостю что-то даёт.
      [{ label: 'Вход', link: { href: '/login' } }],
})

const START_YEAR = 2026

/**
 * Куда уходят из шапки чаще всего — эти маршруты подгружаются заранее, на
 * простое браузера (см. `usePrefetchRoutes`: сам Next 16 этого уже не делает).
 *
 * Оба списка — константы уровня модуля: хук сравнивает массив по ссылке.
 * Гостю незачем греть корзину и заявки — он упрётся в редирект на вход.
 */
const GUEST_PREFETCH = ['/', '/catalog', '/login'] as const
const USER_PREFETCH = ['/', '/catalog', '/orders', '/cart', '/wishlist'] as const

/**
 * Владельцу заранее греются и разделы админки: после снятия SSR-гейта они
 * статические, а значит префетчатся так же, как витрина, — и открываются
 * без ожидания.
 */
const ADMIN_PREFETCH = [
  ...USER_PREFETCH,
  '/admin',
  '/admin/products',
  '/admin/orders',
  '/admin/categories',
  '/admin/cycles',
] as const

/**
 * Раздел верхнего уровня для подсветки активного пункта: у страницы товара
 * путь `/catalog/[slug]`, и точное сравнение с `/catalog` его бы не поймало.
 */
const sectionOf = (path: string): string => {
  const [, section = ''] = path.split('?')[0].split('/')

  return `/${section}`
}

export interface ISiteLayoutProps {
  children: React.ReactNode
  /**
   * Показывать ли счётчик корзины в шапке.
   *
   * Выключается только каркасом админки: шапка витрины там та же, но считать
   * в ней нечего — владелец пришёл разбирать заявки, а не собирать свою. А
   * заодно это единственное, что заставляло админку загружать корзину: без
   * счётчика её на этих страницах не показывает никто (см. `useDemand`).
   *
   * Сама ссылка на корзину остаётся: уйти из админки на витрину надо чем-то.
   */
  isCartCountShown?: boolean
}

export const SiteLayout: React.FC<ISiteLayoutProps> = ({ children, isCartCountShown = true }) => {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const { itemCount } = useCart(isCartCountShown)
  const menu = useDisclosure()

  usePrefetchRoutes(user === null ? GUEST_PREFETCH : isAdmin ? ADMIN_PREFETCH : USER_PREFETCH)

  const navigation = useMemo<ILinkedLabel[]>(
    () => (isAdmin ? [...NAVIGATION, ADMIN_LINK] : NAVIGATION),
    [isAdmin]
  )

  const currentHref = sectionOf(router.asPath)
  const headerUser = user === null ? null : { name: user.name, link: { href: '/account' } }

  const footerColumns = useMemo<IFooterColumn[]>(
    () => [SHOP_COLUMN, accountColumn(user !== null), CONTACTS_COLUMN],
    [user]
  )

  return (
    <BaseLayout
      header={
        <>
          <Header
            logo={{ label: 'Sululu', link: { href: '/' } }}
            navigation={navigation}
            cartLink={{ href: '/cart' }}
            cartCount={isCartCountShown ? itemCount : 0}
            user={headerUser}
            loginLink={{ href: '/login' }}
            currentHref={currentHref}
            onMenuClick={menu.open}
            /*
              Режим «поверх героя» — только на главной: там первый экран
              полноэкранный и начинается от края, остальным страницам шапка
              нужна обычной, sticky с фоном.
            */
            isFloating={router.pathname === '/'}
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
            cartCount={isCartCountShown ? itemCount : 0}
            currentHref={currentHref}
          />
        </>
      }
      footer={
        <Footer
          columns={footerColumns}
          copyright={`© ${START_YEAR} Sululu`}
          note="Оплата и доставка обсуждаются лично"
        />
      }
    >
      {children}
    </BaseLayout>
  )
}
