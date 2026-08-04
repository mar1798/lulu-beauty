import { Head, Html, Main, NextScript } from 'next/document'
import React from 'react'

/**
 * `lang="ru"` — сайт русскоязычный целиком: от этого зависит и синтез речи
 * у скринридера, и переносы, и предложение перевода в браузере.
 */
const Document = (): React.ReactElement => (
  <Html lang="ru">
    <Head />
    <body>
      <Main />
      <NextScript />
    </body>
  </Html>
)

export default Document
