import 'widgets/styling/preflight.css'
import 'widgets/styling/global.css'
import { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import clsx from 'clsx'
import React, { useMemo } from 'react'
import { SWRConfig } from 'swr'
import { ConfirmProvider, ServicesContext, ToastProvider } from 'widgets/contexts'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { WishlistProvider } from '@/contexts/WishlistContext'
import { Link } from '@/components/Link'
import { Image } from '@/components/Image'
import { TelegramMiniAppSession } from '@/components/TelegramMiniAppSession'
import { shell } from '@/styles/shell.css'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
})

/**
 * Дисплейный шрифт — **одно начертание, SemiBold**.
 *
 * Раньше объявлялись все три (400/500/600), и это стоило трёх
 * `<link rel="preload">` вместо одного — ~48 КБ в первом кадре против ~20 КБ.
 * Снять предзагрузку с лишних поштучно нельзя: `preload` у `next/font/local`
 * верхнеуровневый, внутри элементов `src` он молча игнорируется
 * (см. `validate-local-font-function-call.js` — файл там разбирается только
 * на `path`/`weight`/`style`/`ext`). Поэтому лишние начертания не
 * «отключены», а убраны.
 *
 * Убирать было что: дисплейным весом по всем стилям обоих пакетов идёт 600 и
 * только он. 500 не использовал никто, 400 держал единственный экран —
 * крупная цифра на странице ошибки, и та теперь набрана тем же 600, что и
 * остальная крупная типографика темы (см. `ErrorTemplate.css.ts`).
 *
 * Понадобится другой вес — начертание возвращается сюда строкой в `src`;
 * помнить надо лишь о том, что каждая такая строка добавляет предзагрузку.
 */
const eloqua = localFont({
  variable: '--font-eloqua',
  display: 'swap',
  src: [
    {
      path: '../../public/fonts/EloquiaDisplay-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
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
                  <div className={clsx(shell, inter.variable, eloqua.variable, inter.className)}>
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
