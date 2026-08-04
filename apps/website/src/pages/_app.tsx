import 'widgets/styling/preflight.css'
import 'widgets/styling/global.css'
import { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import clsx from 'clsx'
import React from 'react'
import { ServicesContext } from 'widgets/contexts'
import { AuthProvider } from '@/contexts/AuthContext'
import { Link } from '@/components/Link'
import { Image } from '@/components/Image'
import { shell } from '@/styles/shell.css'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
})

const eloqua = localFont({
  variable: '--font-eloqua',
  display: 'swap',
  src: [
    {
      path: '../../public/fonts/EloquiaDisplay-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/EloquiaDisplay-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
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

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  return (
    <ServicesContext.Provider initialState={services}>
      <AuthProvider>
        <div className={clsx(shell, inter.variable, eloqua.variable, inter.className)}>
          <Component {...pageProps} />
        </div>
      </AuthProvider>
    </ServicesContext.Provider>
  )
}

export default App
