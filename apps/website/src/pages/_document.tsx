import { Head, Html, Main, NextScript } from 'next/document'
import React from 'react'

/**
 * `lang="ru"` — сайт русскоязычный целиком: от этого зависит и синтез речи
 * у скринридера, и переносы, и предложение перевода в браузере.
 */
const Document = (): React.ReactElement => (
  <Html lang="ru">
    <Head>
      {/*
        Иконки живут здесь, а не в `_app`: они одинаковы на всех страницах и
        от пропсов не зависят.

        Три файла, потому что просят их по-разному. `favicon.ico` (16/32/48 в
        одном контейнере) — запрос браузера по умолчанию, он уходит даже без
        этой строки, и без файла в ответ приходит 404. `favicon.svg` берут
        современные браузеры и рисуют его в любом масштабе.
        `apple-touch-icon.png` — плитка «на экран «Домой»» в iOS, там же без
        рамки: iOS скругляет углы сама.
      */}
      {/*
        `sizes` перечисляет всё, что лежит в контейнере, и это не формальность:
        Google берёт значок в выдачу, только если находит квадрат кратный 48 —
        объявленные «32x32» при живом 48-м внутри файла означают, что рядом со
        ссылкой останется серый глобус.
      */}
      <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      {/* Цвет холста: им браузер красит адресную строку и подложку под страницей. */}
      <meta name="theme-color" content="#f2f4f5" />
    </Head>
    <body>
      <Main />
      <NextScript />
    </body>
  </Html>
)

export default Document
