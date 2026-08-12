import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { IAdminNavItem } from 'widgets/types'
import {
  IconBox,
  IconCalendar,
  IconChart,
  IconTags,
  IconUpload,
  IconCart,
} from 'widgets/svg'
import { AdminLayout } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'

/**
 * Каркас страниц админки: шапка сайта плюс раскладка `AdminLayout` с
 * разделами. Навигация живёт здесь, а не в виджете, — адреса это знание
 * приложения.
 *
 * `noindex` на всех страницах раздела: они и так закрыты гейтом в
 * `getServerSideProps`, но в выдачу им попадать незачем.
 */

const NAVIGATION: IAdminNavItem[] = [
  { label: 'Обзор', link: { href: '/admin' }, icon: <IconChart /> },
  { label: 'Товары', link: { href: '/admin/products' }, icon: <IconBox /> },
  { label: 'Категории', link: { href: '/admin/categories' }, icon: <IconTags /> },
  { label: 'Импорт', link: { href: '/admin/import' }, icon: <IconUpload /> },
  { label: 'Сборы', link: { href: '/admin/cycles' }, icon: <IconCalendar /> },
  { label: 'Заявки', link: { href: '/admin/orders' }, icon: <IconCart /> },
]

/**
 * Подсветка раздела по префиксу пути: страница товара живёт на
 * `/admin/products/<id>`, и точное сравнение с `/admin/products` её бы не
 * поймало. Обзор сравнивается точно — иначе он подсветился бы везде.
 */
const currentSection = (path: string): string => {
  const clean = path.split('?')[0]
  const match = NAVIGATION.find(
    item => item.link.href !== '/admin' && clean.startsWith(item.link.href)
  )

  return match?.link.href ?? '/admin'
}

export interface IAdminShellProps {
  title: string
  summary?: string
  actions?: React.ReactNode
  /** Фильтры раздела — уходят в левую колонку под разделы. */
  sidebar?: React.ReactNode
  children: React.ReactNode
}

export const AdminShell: React.FC<IAdminShellProps> = ({
  title,
  summary,
  actions,
  sidebar,
  children,
}) => {
  const router = useRouter()

  return (
    <SiteLayout>
      <Head>
        <title>{`${title} — админка Lulu Beauty`}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AdminLayout
        title={title}
        summary={summary}
        navigation={NAVIGATION}
        currentHref={currentSection(router.asPath)}
        actions={actions}
        sidebar={sidebar}
      >
        {children}
      </AdminLayout>
    </SiteLayout>
  )
}
