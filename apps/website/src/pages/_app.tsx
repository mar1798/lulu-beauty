import 'widgets/styling/preflight.css'
import 'widgets/styling/global.css'
import { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import clsx from 'clsx'
import React, { useMemo } from 'react'
import { SWRConfig } from 'swr'
import { ConfirmProvider, ServicesContext, ToastProvider } from 'widgets/contexts'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { WishlistProvider } from '@/contexts/WishlistContext'
import { Link } from '@/components/Link'
import { Image } from '@/components/Image'
import { JsonLd } from '@/components/JsonLd'
import { SiteMeta } from '@/components/PageMeta'
import { TelegramMiniAppSession } from '@/components/TelegramMiniAppSession'
import { storeLd } from '@/utils/jsonLd'
import { shell } from '@/styles/shell.css'

/**
 * Единственный шрифт сайта: им набрано всё, включая заголовки — дисплейная
 * роль темы (`vars.font.display`) смотрит на эту же переменную. Кириллица в
 * сабсетах обязательна: русским тут набран весь интерфейс.
 */
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
})

/**
 * Контейнер инъекции для `widgets`: библиотека не знает ни про `next/link`,
 * ни про `next/image` — только про этот интерфейс. Storybook подкладывает
 * сюда свои заглушки.
 *
 * Значение вынесено из рендера: пересоздание объекта на каждый рендер
 * перерисовывало бы всё дерево виджетов.
 */
const services = {
  services: {},
  components: { Link, Image },
} as const

/**
 * `revalidateOnFocus: false` — на весь `useSWR` в приложении: каталог меняется
 * импортом xlsx, а не в реальном времени, и повторный запрос при возврате
 * фокуса окна только дёргал бы интерфейс без пользы.
 */
const swrConfig = { revalidateOnFocus: false } as const

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  /*
    Страницы со статикой кладут в `pageProps.fallback` то, что уже посчитано на
    сборке (см. `services/swrFallback.ts`). Без этого состояние сбора приезжает
    отдельным запросом после первого кадра — врезка «приём заказов закрыт»
    вдвигается в поток и сдвигает сетку, а кнопки «в корзину» успевают мигнуть
    доступными.
  */
  const fallback = (pageProps as { fallback?: Record<string, unknown> }).fallback

  const value = useMemo(
    () => (fallback === undefined ? swrConfig : { ...swrConfig, fallback }),
    [fallback]
  )

  return (
    <SWRConfig value={value}>
      {/*
          Превью ссылки по умолчанию — на всех страницах, включая приватные:
          публичные перекрывают заголовок и описание своим `PageMeta`.
        */}
      <SiteMeta />

      {/*
          Магазин как сущность — на каждой странице: `sameAs` связывает домен с
          аккаунтами магазина, и связка нужна поисковику везде, где он встретит
          сайт, а не только на главной.
        */}
      <JsonLd data={storeLd()} />

      <ServicesContext.Provider initialState={services}>
        {/*
            Тосты и подтверждения — над данными: подтверждение удаления нужно и
            корзине, и админке, а уведомление об успехе переживает переход между
            страницами внутри раздела.
          */}
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              {/*
                  Сайт, открытый как Mini App, входит сам — на любой странице, а не
                  только на `/login`: внутри Telegram человек попадает сразу в каталог.
                */}
              <TelegramMiniAppSession />
              <CartProvider>
                <WishlistProvider>
                  <div className={clsx(shell, inter.variable, inter.className)}>
                    <Component {...pageProps} />
                  </div>
                </WishlistProvider>
              </CartProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ServicesContext.Provider>
    </SWRConfig>
  )
}

export default App
