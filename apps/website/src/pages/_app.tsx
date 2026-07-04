import 'widgets/styling/preflight.css'
import 'widgets/styling/global.css'
import { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import clsx from 'clsx'
import React from 'react'

const inter = Inter({
  subsets: ['latin'],
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

const App: React.FC<AppProps> = ({
  Component,
  pageProps,
}) => {
  return (
    <>
      <main
        className={clsx(inter.className, eloqua.className)}
      >
        <Component {...pageProps} />
      </main>
    </>
  )
}

export default App
