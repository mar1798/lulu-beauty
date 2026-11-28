import React from 'react'
import Head from 'next/head'
import { Button } from 'widgets/atoms'
import { ErrorTemplate } from 'widgets/templates'
import { Decor } from '@/seasonal/NewYear'
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
      <title>Страница не найдена - Sululu</title>
      <meta name="robots" content="noindex" />
    </Head>

    <ErrorTemplate
      className="ny-error"
      code="404"
      // Леденец над краем карточки (слот `decor`: абсолют, без места в потоке): страница
      // статическая, и в поток после гидрации он сдвинул бы карточку.
      decor={<Decor name="candy-cane" size={120} className="ny-decor--error" />}
      title="Такой страницы нет"
      description="Возможно, ссылка устарела или товар убрали из каталога - состав меняется перед каждым сбором"
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
