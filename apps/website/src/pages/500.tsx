import React from 'react'
import Head from 'next/head'
import { Button, Text } from 'widgets/atoms'
import { ErrorTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'

/**
 * 500.
 *
 * Перезагрузка сделана через `location.reload()`, а не через роутер: сюда
 * попадают, когда сломался сам рендер страницы, и клиентская навигация тем
 * же роутером — не то, что стоит пробовать первым.
 */
const ServerErrorPage: React.FC = () => (
  <SiteLayout>
    <Head>
      <title>Ошибка на сервере — Lulu Beauty</title>
      <meta name="robots" content="noindex" />
    </Head>

    <ErrorTemplate
      code="500"
      title="Что-то сломалось на нашей стороне"
      description="Страница не собралась. Обычно это ненадолго — попробуйте обновить через минуту."
      actions={
        <>
          <Button
            onClick={() => {
              window.location.reload()
            }}
          >
            Обновить страницу
          </Button>

          <Button link={{ href: '/catalog' }} variant="secondary">
            В каталог
          </Button>
        </>
      }
      details={
        <Text size="sm" tone="muted">
          Заявки и корзина при этом не теряются — они хранятся на сервере, а не в браузере.
        </Text>
      }
    />
  </SiteLayout>
)

export default ServerErrorPage
