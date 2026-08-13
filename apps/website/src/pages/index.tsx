import React from 'react'
import Head from 'next/head'
import type { GetStaticProps } from 'next'
import type { IOrderCycle, IProduct } from 'widgets/types'
import { Button, Text } from 'widgets/atoms'
import { DeadlineCountdown, SectionHeading, StepList } from 'widgets/molecules'
import { HomeHero, ProductGrid } from 'widgets/organisms'
import { HomeTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import * as styles from '@/styles/home.css'
import { AddToCartButton } from '@/components/AddToCartButton'
import { WishlistButton } from '@/components/WishlistButton'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { listProducts } from '@/services/endpoints/catalog'
import { activeCycleFallback, type ISwrFallback } from '@/services/swrFallback'

/**
 * Главная.
 *
 * Статика с ISR, как и каталог: и сбор, и подборка меняются медленно, а
 * первый экран обязан приезжать без единого запроса из браузера.
 *
 * Отсутствие открытого сбора — **штатное** состояние витрины (`GET
 * /cycles/active` отдаёт 404), а не сбой: страница в нём рендерится целиком,
 * меняются только надзаголовок и врезка.
 */

const REVALIDATE_SECONDS = 60

/** Подборка на главной — одна строка сетки на широком экране. */
const FEATURED_COUNT = 8

const STEPS = [
  {
    title: 'Соберите корзину',
    description:
      'Каталог открыт всегда. Товары появляются перед каждым сбором, цены — за них же.',
  },
  {
    title: 'Оформите заявку',
    description:
      'Это не оплата: заявка уходит владельцу, а цены фиксируются на момент отправки.',
  },
  {
    title: 'Дождитесь звонка',
    description:
      'После закрытия сбора владелец свяжется с вами, подтвердит состав и договорится о выдаче.',
  },
]

interface IHomePageProps {
  /** `null` — открытого сбора нет либо API был недоступен на сборке. */
  cycle: IOrderCycle | null
  featured: IProduct[]
  /** Тот же сбор, но для кеша SWR: его читают кнопки «в корзину» в подборке. */
  fallback: ISwrFallback
}

export const getStaticProps: GetStaticProps<IHomePageProps> = async () => {
  /*
    Каждый запрос со своим `catch`: недоступный на сборке API не должен ронять
    `next build`, а пустая подборка не повод прятать сбор (и наоборот).
  */
  const [cycle, featured] = await Promise.all([
    getActiveCycleOrNull().catch(() => null),
    listProducts({ pageSize: FEATURED_COUNT, inStock: true })
      .then(page => page.items)
      .catch(() => []),
  ])

  return {
    props: { cycle, featured, fallback: activeCycleFallback(cycle) },
    revalidate: REVALIDATE_SECONDS,
  }
}

const HomePage: React.FC<IHomePageProps> = ({ cycle, featured }) => (
  <SiteLayout>
    <Head>
      <title>Lulu Beauty — косметика и уход заказом на всех</title>
      <meta
        name="description"
        content="Собираем общий заказ косметики к дедлайну: выберите товары, оформите заявку — владелец свяжется с вами после закрытия сбора."
      />
    </Head>

    <HomeTemplate
      hero={
        <HomeHero
          eyebrow={cycle === null ? 'Сбор закрыт' : 'Сбор открыт'}
          title="Косметика и уход — заказом на всех"
          description="Мы собираем общий заказ к дедлайну: вы отправляете заявку, а владелец подтверждает её и договаривается о выдаче лично."
          actions={
            <>
              <Button link={{ href: '/catalog' }}>Смотреть каталог</Button>

              <Button link={{ href: '/orders' }} variant="secondary">
                Мои заявки
              </Button>
            </>
          }
          aside={
            cycle === null ? (
              <Text size="sm" tone="secondary">
                Сейчас открытого сбора нет. Соберите корзину — она дождётся следующего.
              </Text>
            ) : (
              <DeadlineCountdown deadlineAt={cycle.deadlineAt} />
            )
          }
        />
      }
    >
      {/*
        Подборку прячем целиком, если товаров нет: пустая сетка с «ничего не
        нашлось» на главной читается как поломка, хотя это ровно то же
        состояние, что каталог показывает честно и с объяснением.
      */}
      {featured.length > 0 && (
        <section className={styles.section}>
          <SectionHeading
            eyebrow="Свежая подборка"
            title="Что можно взять прямо сейчас"
            description="Товары в наличии — состав каталога меняется перед каждым сбором."
            action={
              <Button link={{ href: '/catalog' }} variant="secondary" size="sm">
                Весь каталог
              </Button>
            }
          />

          <ProductGrid
            products={featured}
            buildHref={product => `/catalog/${product.slug}`}
            renderAction={product =>
              product.inStock ? (
                <AddToCartButton productId={product.id} isCompact={true} />
              ) : null
            }
            renderMediaAction={product => <WishlistButton productId={product.id} />}
          />
        </section>
      )}

      <section className={styles.section}>
        <SectionHeading
          eyebrow="Как это работает"
          title="Заявка вместо оплаты"
          description="Онлайн-оплаты нет: всё, что нужно, — успеть до закрытия сбора."
        />

        <StepList steps={STEPS} />
      </section>
    </HomeTemplate>
  </SiteLayout>
)

export default HomePage
