import React, { useRef } from 'react'
import Head from 'next/head'
import type { GetStaticProps } from 'next'
import type { ICategory, IDecorSpot, IOrderCycle, IProduct, IStep } from 'widgets/types'
import { Button, Parallax, Reveal } from 'widgets/atoms'
import {
  BrandMarquee,
  CategoryTiles,
  DEADLINE_URGENT_HOURS,
  DeadlineCountdown,
  DecorField,
  HomeSection,
  SectionHeading,
  StatusPanel,
  StepList,
} from 'widgets/molecules'
import { useCountdown } from 'widgets/hooks'
import { FaqAccordion, HomeCta, HomeHero, ProductGrid } from 'widgets/organisms'
import { HomeTemplate } from 'widgets/templates'
import { staggerDelay } from 'widgets/utils'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { WishlistButton } from '@/components/WishlistButton'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { listBrands, listCategories, listProducts } from '@/services/endpoints/catalog'
import { activeCycleFallback, type ISwrFallback } from '@/services/swrFallback'
import { publicConfig } from '@/сonfig'

/**
 * Главная.
 *
 * Статика с ISR, как и каталог: и сбор, и подборка меняются медленно, а
 * первый экран обязан приезжать без единого запроса из браузера.
 *
 * Отсутствие открытого сбора — **штатное** состояние витрины (`GET
 * /cycles/active` отдаёт 404), а не сбой: страница в нём рендерится целиком,
 * меняются только надзаголовок и слот таймера.
 */

const REVALIDATE_SECONDS = 60

/** Подборка на главной — одна строка сетки на широком экране. */
const FEATURED_COUNT = 8

/**
 * Ручная лесенка страницы: сначала заголовок секции, через две ступени —
 * её содержимое. Шаг берём из общей лесенки виджетов, чтобы страница и
 * `CategoryTiles`/`FaqAccordion` шли одним ритмом.
 */
const SECTION_CONTENT_DELAY = staggerDelay(2)

/** Мини-сцену (`visual`) каждому шагу выбирает страница: виджет data-free. */
const STEPS: IStep[] = [
  {
    title: 'Соберите корзину',
    description:
      'Каталог открыт всегда. Товары появляются перед каждым сбором, цены — за них же.',
    visual: 'cart',
  },
  {
    title: 'Оформите заявку',
    description:
      'Это не оплата: заявка уходит владельцу и ждёт его решения — списаний не будет.',
    visual: 'request',
  },
  {
    title: 'Дождитесь подтверждения',
    description:
      'После закрытия сбора владелец подтвердит заявку — уведомление придёт в Telegram.',
    visual: 'confirm',
  },
  {
    title: 'Получите товар',
    description:
      'Когда заказ приедет, владелец свяжется с вами и обсудит варианты доставки или самовывоза.',
    visual: 'handover',
  },
]

/** Все ответы опираются на факты из PLAN/FRONTEND_PLAN и текущего UI — без обещаний. */
const FAQ_ITEMS = [
  {
    question: 'Чем заявка отличается от заказа?',
    answer:
      'Заявка — это список того, что вы хотите взять в текущем сборе. Она уходит владельцу, а не в оплату: денег на сайте не списывают.',
  },
  {
    question: 'Почему нельзя оплатить на сайте?',
    answer:
      'Онлайн-оплаты нет вовсе. Владелец собирает общий заказ и подтверждает заявки после закрытия сбора — оплата и выдача обсуждаются лично.',
  },
  {
    question: 'Что будет с ценой, если она изменится?',
    answer:
      'Пока заявка ждёт подтверждения, цена в ней идёт вслед за каталогом — если товар подорожает или подешевеет, бот пришлёт об этом уведомление. После подтверждения владельцем цены в заявке уже не меняются.',
  },
  {
    question: 'Как я узнаю, что заявку подтвердили?',
    answer:
      'Уведомление придёт в Telegram от бота. Звонить вам никто не будет: подтверждение приходит в чат, а о выдаче договариваются уже после него.',
  },
  {
    // Сверено с `apps/api/app/orders/service.py`: правка — пока заявка PENDING
    // и сбор открыт, возврат отменённой — пока сбор открыт.
    question: 'Можно ли изменить или отменить заявку?',
    answer:
      'Пока сбор открыт и заявка ещё не подтверждена — да: в разделе «Мои заявки» можно поменять состав и отменить заявку. Отменённую, пока сбор открыт, можно вернуть обратно.',
  },
  {
    question: 'Как войти, если у меня нет пароля?',
    answer:
      'Пароля нет ни у кого. Вы открываете вход, подтверждаете его в чате бота — и возвращаетесь на сайт уже вошедшим. Аккаунт заводится там же, когда вы делитесь контактом с ботом.',
  },
  {
    question: 'Сбора сейчас нет — что делать?',
    answer:
      'Каталог открыт всегда, но корзина работает только при открытом сборе. Добавляйте понравившееся в избранное: оттуда всё вернётся в корзину одним нажатием, когда откроется следующий сбор.',
  },
]

/**
 * Фоновые декоративные пятна — PNG из `public/assets`, размеры файлов
 * настоящие (иначе CLS и `fill`-режим адаптера). `alt` пустой: пятна лежат
 * под `aria-hidden` и ничего не сообщают.
 *
 * Инварианты ревизии 2 (их проверяет приёмка, грепом): отступ от края
 * (`offsetX`) неотрицателен — за край уходит только ореол; `top` (центр
 * пятна) в диапазоне 32–68 %; размер — только ступенью `size`; не больше
 * двух пятен на секцию. Пятно теперь стоит четырёх композиторских слоёв
 * (параллакс, левитация, ореол, картинка) — третье уронило бы кадры на
 * среднем Android.
 *
 * `floatPhase` у соседних пятен разный — левитация не должна идти в такт.
 *
 * `isFlipped` здесь не используется ни у одного пятна: на этикетках баночек
 * есть надписи, и отзеркаленная — читается не как «другая баночка», а как
 * ошибка вёрстки. Флаг придуман против повтора одной картинки дважды, а на
 * странице все семь PNG разные, так что повторять нечего.
 */
const spot = (
  src: string,
  placement: Omit<IDecorSpot, 'image'>,
): IDecorSpot => ({
  image: { src, alt: '', width: 1024, height: 1536 },
  ...placement,
})

/*
  Текст героя левосторонний и занимает лево-центр экрана, поэтому оба пятна
  стоят в свободной правой зоне на разной высоте — слева любое пятно легло
  бы под display-заголовок, и он перестал бы читаться.
*/
const HERO_SPOTS = [
  spot('/assets/anua.png', {
    /*
      Не `isStrong`: на десктопе правая зона пуста, но на мобильном текст
      занимает всю ширину и ложится поверх — а флаг общий на все ширины.
    */
    side: 'right',
    offsetX: 'clamp(16px, 3vw, 56px)',
    top: '34%',
    size: 'lg',
    depth: 0.35,
    floatPhase: 0,
  }),
  spot('/assets/celimax serum.png', {
    /*
      Отступ крупный сознательно: прижатая к краю баночка встала бы ровно за
      непрозрачной панелью таймера — а так она выглядывает из-за её левого
      плеча, и перекрытие читается как глубина, а не как пропажа.
    */
    side: 'right',
    offsetX: 'clamp(8px, 20vw, 300px)',
    top: '64%',
    size: 'sm',
    depth: 0.8,
    floatPhase: 0.55,
    halo: 'accent',
  }),
]

/*
  В секциях с плотным контентом (чипы, карточки шагов) пятно живёт в боковой
  канаве между краем экрана и `Container` — отступ поэтому маленький: чем он
  больше, тем глубже баночка уходит под непрозрачные карточки.
*/
const CATALOG_SPOTS = [
  spot('/assets/manyo toner.png', {
    side: 'right',
    offsetX: 'clamp(8px, 1.5vw, 24px)',
    top: '40%',
    size: 'md',
    depth: 0.65,
    floatPhase: 0.3,
    isStrong: true,
  }),
  spot('/assets/round lab cleanser.png', {
    side: 'left',
    offsetX: 'clamp(8px, 1vw, 16px)',
    top: '66%',
    size: 'sm',
    depth: 0.3,
    floatPhase: 0.8,
    halo: 'accent',
  }),
]

const STEPS_SPOTS = [
  spot('/assets/centella oil.png', {
    side: 'left',
    offsetX: 'clamp(8px, 1vw, 16px)',
    top: '38%',
    size: 'md',
    depth: 0.5,
    floatPhase: 0.2,
  }),
  spot('/assets/medicube toner.png', {
    side: 'right',
    offsetX: 'clamp(8px, 1.5vw, 24px)',
    top: '54%',
    size: 'lg',
    depth: 0.85,
    floatPhase: 0.65,
    isStrong: true,
  }),
]

/*
  FAQ — единственная секция без своего пятна, и на ней страница перед плашкой
  CTA заметно пустеет. Пятно одно и справа: аккордеон занимает всю ширину
  `Container`, поэтому баночка живёт в боковой канаве — отступ такой же
  маленький, как у остальных плотных секций, иначе она уйдёт под строки
  вопросов. `md`, а не `lg`: секция растёт по числу открытых ответов, и
  ступень подобрана под её минимальную высоту.
*/
const FAQ_SPOTS = [
  spot('/assets/dr.alteya cream.png', {
    side: 'right',
    offsetX: 'clamp(8px, 1.5vw, 24px)',
    top: '46%',
    size: 'md',
    depth: 0.45,
    floatPhase: 0.45,
    halo: 'accent',
  }),
]

interface IHomePageProps {
  /** `null` — открытого сбора нет либо API был недоступен на сборке. */
  cycle: IOrderCycle | null
  featured: IProduct[]
  categories: ICategory[]
  brands: string[]
  /** Тот же сбор, но для кеша SWR: его читают кнопки «в корзину» в подборке. */
  fallback: ISwrFallback
}

export const getStaticProps: GetStaticProps<IHomePageProps> = async () => {
  /*
    Каждый запрос со своим `catch`: недоступный на сборке API не должен ронять
    `next build`, а пустая подборка не повод прятать сбор (и наоборот).
  */
  const [cycle, featured, categories, brands] = await Promise.all([
    getActiveCycleOrNull().catch(() => null),
    listProducts({ pageSize: FEATURED_COUNT, inStock: true })
      .then(page => page.items)
      .catch(() => []),
    listCategories().catch((): ICategory[] => []),
    listBrands().catch((): string[] => []),
  ])

  return {
    props: { cycle, featured, categories, brands, fallback: activeCycleFallback(cycle) },
    revalidate: REVALIDATE_SECONDS,
  }
}

/**
 * Панель состояния сбора в слоте `aside` героя. Панель и таймер сами ничего
 * не знают друг о друге, поэтому «меньше суток» страница считает тем же
 * порогом, что и таймер (`DEADLINE_URGENT_HOURS`), и поднимает
 * `tone="urgent"` — правило одно, а не два. Состояние «сбора нет» — та же
 * панель с другой надписью: не деградация, а другая строка композиции.
 *
 * Истёкший дедлайн приводится к тому же состоянию: страница статическая с
 * `revalidate: 60`, а сбор закрывает планировщик API со своим интервалом, так
 * что минуту-другую после дедлайна `cycle` ещё приезжает открытым. Без этой
 * ветки панель показывала бы живую пульсирующую точку и метку «до закрытия
 * сбора» над строкой «сбор заказов закрыт» — три взаимоисключающих сигнала
 * разом.
 */
const HeroStatus: React.FC<{ cycle: IOrderCycle | null }> = ({ cycle }) => {
  const { days, hours, isExpired, isReady } = useCountdown(cycle?.deadlineAt ?? null)

  if (cycle === null || (isReady && isExpired)) {
    return (
      <StatusPanel label="Сбор закрыт" tone="muted">
        Открытого сбора сейчас нет. Сохраняйте понравившееся в избранное — оттуда всё
        вернётся в корзину, когда откроется следующий.
      </StatusPanel>
    )
  }

  const isUrgent = isReady && !isExpired && days === 0 && hours < DEADLINE_URGENT_HOURS

  return (
    <StatusPanel
      label="До закрытия сбора"
      isLive={true}
      tone={isUrgent ? 'urgent' : 'brand'}
    >
      <DeadlineCountdown
        deadlineAt={cycle.deadlineAt}
        variant="blocks"
        isLabelHidden={true}
      />
    </StatusPanel>
  )
}

const HomePage: React.FC<IHomePageProps> = ({ cycle, featured, categories, brands }) => {
  /*
    Ссылки секций — цели `useScroll` в `DecorField`. Герою нужна обёртка:
    свой DOM-узел он наружу не отдаёт.
  */
  const heroRef = useRef<HTMLDivElement | null>(null)
  const catalogRef = useRef<HTMLElement | null>(null)
  const stepsRef = useRef<HTMLElement | null>(null)
  const faqRef = useRef<HTMLElement | null>(null)
  const ctaRef = useRef<HTMLElement | null>(null)

  const botUsername = publicConfig('telegramBotUsername')

  return (
    <SiteLayout>
      <Head>
        <title>Lulu Beauty — самые низкие цены на косметику и уход</title>
        <meta
          name="description"
          content="Косметика и уход по самым низким ценам: берём напрямую и общим заказом. Соберите заявку до закрытия сбора — владелец подтвердит её в Telegram."
        />
      </Head>

      <HomeTemplate
        hero={
          <div ref={heroRef}>
            <HomeHero
              title={['С заботой о вас', 'и о вашем бюджете']}
              description="Косметика и уход по самым низким ценам: берём напрямую и общим заказом."
              background={<DecorField spots={HERO_SPOTS} containerRef={heroRef} />}
              scrollHint="Ниже — что можно взять сейчас"
              actions={
                <>
                  <Button link={{ href: '/catalog' }} isFullWidth="mobile">
                    Смотреть каталог
                  </Button>

                  <Button link={{ href: '/orders' }} variant="secondary" isFullWidth="mobile">
                    Мои заявки
                  </Button>
                </>
              }
              aside={<HeroStatus cycle={cycle} />}
            />
          </div>
        }
      >
        {/*
          Подборку прячем целиком, если товаров нет: пустая сетка с «ничего не
          нашлось» на главной читается как поломка, хотя это ровно то же
          состояние, что каталог показывает честно и с объяснением.
        */}
        {featured.length > 0 && (
          <HomeSection>
            <Reveal>
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
            </Reveal>

            {/* Лесенка здесь по карточке, а не по блоку целиком — см. §7.3 контракта. */}
            <ProductGrid
              products={featured}
              isStaggered={true}
              buildHref={product => `/catalog/${product.slug}`}
              renderAction={product =>
                product.inStock ? (
                  <AddToCartButton productId={product.id} isCompact={true} />
                ) : null
              }
              renderMediaAction={product => <WishlistButton productId={product.id} />}
            />
          </HomeSection>
        )}

        {/* Пустые категории и бренды прячут каждый свой блок; пусто и там и там — секции нет. */}
        {(categories.length > 0 || brands.length > 0) && (
          <HomeSection
            sectionRef={catalogRef}
            /* Оглавление, а не витрина: плотный ритм, чтобы не забирать пол-экрана. */
            density="compact"
            background={<DecorField spots={CATALOG_SPOTS} containerRef={catalogRef} />}
          >
            <Reveal>
              <SectionHeading
                eyebrow="Ассортимент"
                title="С чего начать"
                description="Разделы каталога и бренды, которые в нём уже есть."
              />
            </Reveal>

            {categories.length > 0 && (
              <CategoryTiles
                categories={categories}
                buildHref={category => `/catalog?category=${encodeURIComponent(category.slug)}`}
              />
            )}

            {brands.length > 0 && (
              <Reveal delay={SECTION_CONTENT_DELAY}>
                {/*
                  Лёгкий горизонтальный параллакс поверх собственной
                  CSS-анимации ленты — сама лента не тронута, она утверждена.
                */}
                <Parallax axis="x" strength={40} containerRef={catalogRef}>
                  <BrandMarquee
                    brands={brands}
                    buildHref={brand => `/catalog?brand=${encodeURIComponent(brand)}`}
                  />
                </Parallax>
              </Reveal>
            )}
          </HomeSection>
        )}

        <HomeSection
          sectionRef={stepsRef}
          background={<DecorField spots={STEPS_SPOTS} containerRef={stepsRef} />}
        >
          <Reveal>
            <SectionHeading
              eyebrow="Как это работает"
              title="Заявка вместо оплаты"
              description="Онлайн-оплаты нет: всё, что нужно, — успеть до закрытия сбора."
            />
          </Reveal>

          <StepList steps={STEPS} />
        </HomeSection>

        <HomeSection
          sectionRef={faqRef}
          background={<DecorField spots={FAQ_SPOTS} containerRef={faqRef} />}
        >
          <Reveal>
            <SectionHeading eyebrow="Вопросы" title="Что обычно спрашивают" />
          </Reveal>

          <FaqAccordion items={FAQ_ITEMS} />
        </HomeSection>

        <HomeSection sectionRef={ctaRef}>
          <Reveal>
            <Parallax strength={24} containerRef={ctaRef}>
              <HomeCta
                title="Вход и подтверждение — в Telegram"
                description="Бот заводит аккаунт, подтверждает вход и присылает решение по заявке. Больше он ничего не делает и никуда не пишет."
                note="Оплата и доставка обсуждаются лично"
                actions={
                  <>
                    {/*
                      Чистая ссылка на бота, без `?start=` — см. расхождение №4 в
                      FRONTEND_PLAN.md. Без настроенного имени бота кнопке вести
                      некуда, и она не рендерится.
                    */}
                    {botUsername !== '' && (
                      <Button
                        link={{ href: `https://t.me/${botUsername}`, target: '_blank' }}
                        isFullWidth="mobile"
                      >
                        Открыть бота
                      </Button>
                    )}

                    <Button link={{ href: '/catalog' }} variant="secondary" isFullWidth="mobile">
                      Смотреть каталог
                    </Button>
                  </>
                }
              />
            </Parallax>
          </Reveal>
        </HomeSection>
      </HomeTemplate>
    </SiteLayout>
  )
}

export default HomePage
