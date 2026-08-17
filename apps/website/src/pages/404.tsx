import React from 'react'
import Head from 'next/head'
import { Button } from 'widgets/atoms'
import { ErrorTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'

/**
 * 404.
 *
 * Внутри `SiteLayout`, а не отдельным экраном: человек, попавший сюда по
 * устаревшей ссылке, должен видеть шапку с каталогом и корзиной — уходить
 * ему обычно не туда, куда он шёл, а туда, где товары.
 *
 * Страница статическая: `getStaticProps` тут нечего делать, а Next и так
 * отдаёт её без обращения к серверу.
 */
const NotFoundPage: React.FC = () => (
  <SiteLayout>
    <Head>
      <title>Страница не найдена — Lulu Beauty</title>
      <meta name="robots" content="noindex" />
    </Head>

    <ErrorTemplate
      code="404"
      title="Такой страницы нет"
      description="Возможно, ссылка устарела или товар убрали из каталога — состав меняется перед каждым сбором."
      actions={
        <>
          <Button link={{ href: '/catalog' }} isFullWidth="mobile">
            В каталог
          </Button>

          <Button link={{ href: '/' }} variant="secondary" isFullWidth="mobile">
            На главную
          </Button>
        </>
      }
    />
  </SiteLayout>
)

export default NotFoundPage
