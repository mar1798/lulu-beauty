import React, { useRef } from 'react'
import type { GetStaticProps } from 'next'
import type { ICategory, IDecorSpot, IOrderCycle, IProduct, IStep } from 'widgets/types'
import { Badge, Button, Float, Parallax, Reveal } from 'widgets/atoms'
import {
  BrandMarquee,
  CategoryTiles,
  DEADLINE_URGENT_HOURS,
  DeadlineCountdown,
  DecorField,
  HomeSection,
  ProductCard,
  SectionHeading,
  ShowcaseMore,
  StatusPanel,
  StepList,
} from 'widgets/molecules'
import { useCountdown } from 'widgets/hooks'
import { FaqAccordion, HomeCta, HomeHero, ProductGrid } from 'widgets/organisms'
import { HomeTemplate } from 'widgets/templates'
import { pluralize, staggerDelay } from 'widgets/utils'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { JsonLd } from '@/components/JsonLd'
import { PageMeta } from '@/components/PageMeta'
import { WishlistButton } from '@/components/WishlistButton'
import { useCycleExpiryRefresh } from '@/hooks/useCycleExpiryRefresh'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { listBrands, listCategories, listProducts } from '@/services/endpoints/catalog'
import { activeCycleFallback, type ISwrFallback } from '@/services/swrFallback'
import { INSTAGRAM_URL } from '@/utils/contacts'
import { faqLd } from '@/utils/jsonLd'
import { SITE_DESCRIPTION, SITE_TITLE } from '@/utils/seo'
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
    description: 'Каталог открыт всегда. Товары появляются перед каждым сбором',
    visual: 'cart',
  },
  {
    title: 'Оформите заявку',
    description: 'Заявка уходит нам и ждёт решения - на сайте ничего не списывается',
    visual: 'request',
  },
  {
    title: 'Дождитесь подтверждения',
    description: 'После закрытия сбора мы подтвердим заявку - уведомление придёт в Telegram',
    visual: 'confirm',
  },
  {
    title: 'Получите товар',
    description:
      'Когда заказ приедет, мы свяжемся с вами и обсудим варианты доставки или самовывоза',
    visual: 'handover',
  },
]

/** Все ответы опираются на факты о реальном поведении сайта — без обещаний. */
const FAQ_ITEMS = [
  {
    question: 'Чем заявка отличается от заказа?',
    answer:
      'Заявка - это список того, что вы хотите взять в текущем сборе. Она уходит нам, а не в оплату: денег на сайте не списывают.',
  },
  {
    question: 'Почему нельзя оплатить на сайте?',
    answer:
      'Онлайн-оплаты нет вовсе. Мы собираем общий заказ и подтверждаем заявки после закрытия сбора - оплата и выдача обсуждаются лично.',
  },
  {
    question: 'Что будет с ценой, если она изменится?',
    answer:
      'Пока заявка ждёт подтверждения, цена в ней идёт вслед за каталогом - если товар подорожает или подешевеет, бот пришлёт об этом уведомление. После подтверждения цены в заявке уже не меняются.',
  },
  {
    question: 'Из чего складывается цена?',
    answer:
      'Из стоимости товара на момент сбора и доставки. И то и другое меняется от сбора к сбору, поэтому одна и та же позиция может стоить по-разному.',
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
      'Пока сбор открыт и заявка ещё не подтверждена - да: в разделе «Мои заявки» можно поменять состав и отменить заявку. Отменённую, пока сбор открыт, можно вернуть обратно.',
  },
  {
    question: 'Как связаться с магазином?',
    answer:
      'Напишите напрямую в {link} - это единственный публичный контакт, в остальном переписку ведёт бот в Telegram.',
    action: { label: 'Instagram магазина', link: { href: INSTAGRAM_URL, target: '_blank' } },
  },
  {
    question: 'Как войти, если у меня нет пароля?',
    answer:
      'Пароля нет ни у кого. Вы открываете вход, подтверждаете его в чате бота - и возвращаетесь на сайт уже вошедшим. Аккаунт заводится там же, когда вы делитесь контактом с ботом.',
  },
  {
    question: 'Сбора сейчас нет - что делать?',
    answer:
      'Каталог открыт всегда, но корзина работает только при открытом сборе. Добавляйте понравившееся в избранное: список сохранится, и когда откроется следующий сбор, товары из него можно будет добавить в корзину.',
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
const spot = (src: string, placement: Omit<IDecorSpot, 'image'>): IDecorSpot => ({
  image: { src, alt: '', width: 1024, height: 1536 },
  ...placement,
})

/*
  Пятна героя, ревизия 3. Раньше правая зона первого экрана пустовала, и туда
  вставала крупная баночка; теперь там витрина товаров, и декор ушёл в боковые
  канавы — между краем экрана и `Container`, ровно как в плотных секциях ниже.
  Оба пятна поэтому стали на ступень мельче и с маленькими отступами: чем
  больше отступ, тем глубже баночка уходит под непрозрачные карточки.

  Приоритетной загрузки здесь больше нет ни у одного пятна. LCP первого экрана
  теперь — фотография первого товара витрины (`isPriority` у `ProductCard`), и
  приоритет ушёл туда: тратить его на картинку, которая ничего не продаёт,
  незачем, а два приоритетных изображения на экран — это отсутствие приоритета.
*/
const HERO_SPOTS = [
  spot('/assets/anua.png', {
    /*
      Не `isStrong`: до `lg` витрина уезжает под текст, и на мобильном пятно
      оказывается под строками заголовка — а флаг общий на все ширины.
    */
    side: 'right',
    offsetX: 'clamp(8px, 1.5vw, 24px)',
    top: '38%',
    size: 'md',
    depth: 0.5,
    floatPhase: 0,
  }),
  spot('/assets/celimax serum.png', {
    /*
      Левая канава на высоте таймера и кнопок. Отступ маленький: баночка должна
      выглядывать из-за них краем, а не уходить под них целиком — вглубь экрана
      её тянуть некуда, кнопки стоят от левого края `Container`.
    */
    side: 'left',
    offsetX: 'clamp(8px, 4vw, 64px)',
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
  /**
   * Сколько товаров сейчас в наличии — для строки доверия под кнопками и
   * подписи замыкающей плитки витрины. Не `featured.length`: тот ограничен
   * `FEATURED_COUNT` и сообщил бы «8 товаров» про каталог из двух сотен.
   *
   * Именно в наличии, а не всего: это `total` того же запроса, которым набрана
   * витрина (`inStock: true`), и обещать сотню позиций, половина которых
   * кончилась, страница не должна.
   */
  productCount: number
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
  const [cycle, page, categories, brands] = await Promise.all([
    getActiveCycleOrNull().catch(() => null),
    /* Тот же запрос отдаёт и подборку, и общее число товаров — второй не нужен. */
    listProducts({ pageSize: FEATURED_COUNT, inStock: true }).catch(() => ({
      items: [] as IProduct[],
      total: 0,
    })),
    listCategories().catch((): ICategory[] => []),
    listBrands().catch((): string[] => []),
  ])

  return {
    props: {
      cycle,
      featured: page.items,
      productCount: page.total,
      categories,
      brands,
      fallback: activeCycleFallback(cycle),
    },
    revalidate: REVALIDATE_SECONDS,
  }
}

/** Сколько карточек стоит в витрине героя. Ряд, а не сетка: см. `HomeHero`. */
const SHOWCASE_COUNT = 3

/**
 * Левитация карточек витрины: у каждой своя.
 *
 * Фазы не по возрастанию намеренно — соседние по ряду карточки должны
 * расходиться сильнее, чем крайние между собой, иначе кластер качается волной
 * слева направо. Амплитуды разные по той же причине: при равном ходе три
 * карточки идут по одной дуге, просто вразнобой, и кластер всё ещё читается
 * как один качающийся объект. Ход у всех маленький — под слоем живой текст и
 * кликабельная ссылка, а не приглушённая картинка.
 */
const SHOWCASE_FLOAT = [
  { phase: 0, distance: 5 },
  { phase: 0.62, distance: 2 },
  { phase: 0.28, distance: 4 },
]

/**
 * Ширина карточки витрины: лента до `lg`, треть правой колонки после.
 *
 * Ступень `xl` — не лишняя точность, а потолок. `Container` перестаёт расти на
 * 1200px, то есть с ~1240px карточка кластера стоит фиксированные ~180px, а
 * доля экрана продолжала бы расти: на 2560px `15vw` просит 384px — вдвое
 * больше нужного, и это притом что первая карточка идёт приоритетной и её
 * тянет `<link rel=preload>` ещё до раскладки. Ниже `xl` доля считает верно
 * (на 1024px это 154px против нужных ~145).
 */
const SHOWCASE_SIZES = { fb: '44vw', lg: '15vw', xl: 180 } as const

/**
 * Герой целиком — отдельным компонентом, а не куском `HomePage`.
 *
 * Дело в таймере: `useCountdown` тикает раз в секунду, и в `HomePage` этот тик
 * перерисовывал бы всю главную — четыре `DecorField`, сетку подборки с
 * кнопками, ленту брендов, аккордеон. Здесь он перерисовывает только героя, а
 * тяжёлые слоты (фон и карточки витрины) приходят сюда пропсами: элементы
 * созданы снаружи, между тиками это одни и те же ссылки, и React пропускает их
 * поддеревья целиком.
 *
 * Состояние сбора считает страница, а не виджет: сбор — данные сайта, герою
 * про заявки знать не положено. Порог «меньше суток» берём тот же, которым
 * живёт таймер (`DEADLINE_URGENT_HOURS`), — правило одно, а не два.
 */
const HeroCycle: React.FC<{
  cycle: IOrderCycle | null
  note?: string
  background: React.ReactNode
  showcase?: React.ReactNode
  showcaseMore?: React.ReactNode
}> = ({ cycle, note, background, showcase, showcaseMore }) => {
  const { days, hours, isExpired, isReady } = useCountdown(cycle?.deadlineAt ?? null)

  /*
    Приведение ниже чинит только героя, а витрина подборки с кнопками «в
    корзину» осталась бы при устаревшем сборе. Поэтому на нуле таймера сбор
    ещё и перепроверяется — тогда страница целиком узнаёт о закрытии, а не
    один блок на ней.
  */
  useCycleExpiryRefresh(cycle?.deadlineAt ?? null)

  /*
    Истёкший дедлайн приводится к «сбора нет»: страница статическая с
    `revalidate: 60`, а сбор закрывает планировщик API со своим интервалом, так
    что минуту-другую после дедлайна `cycle` ещё приезжает открытым. Без этой
    ветки метка показывала бы живую пульсирующую точку и «сбор открыт» над
    нулевым таймером — три взаимоисключающих сигнала разом.

    Открытый сбор — это сам `cycle`, а не флаг рядом с ним: так у панели с
    таймером дедлайн виден типам, и `deadlineAt` не приходится подпирать
    пустой строкой.
  */
  const openCycle = isReady && isExpired ? null : cycle
  const isUrgent = openCycle !== null && isReady && days === 0 && hours < DEADLINE_URGENT_HOURS

  return (
    <HomeHero
      title={['Корейская косметика', 'по самым низким ценам']}
      description="Заказываем общим объёмом и напрямую - поэтому и цены самые низкие. Оплаты на сайте нет: вы оставляете заявку, а решение по ней присылает бот."
      background={background}
      badge={
        openCycle !== null ? (
          <Badge tone="brand" withDot={true}>
            Сбор открыт
          </Badge>
        ) : (
          <Badge tone="neutral">Сбора сейчас нет</Badge>
        )
      }
      status={
        openCycle !== null ? (
          <StatusPanel label="До закрытия сбора" isLive={true} tone={isUrgent ? 'urgent' : 'brand'}>
            <DeadlineCountdown
              deadlineAt={openCycle.deadlineAt}
              variant="blocks"
              isLabelHidden={true}
            />
          </StatusPanel>
        ) : (
          <StatusPanel label="Следующий сбор откроется - бот сообщит" tone="muted">
            Каталог открыт всегда. Сохраняйте понравившееся в избранное - список дождётся следующего
            сбора.
          </StatusPanel>
        )
      }
      actions={
        <>
          {/*
            Одно действие, а не два равноправных: главная кнопка акцентная,
            вторая — `secondary`. На телефоне обе во всю ширину: там кнопки
            стоят друг под другом, и вторая вполовину уже первой читается как
            обрезанная, а не как более тихая.
          */}
          <Button
            link={{ href: openCycle !== null ? '/catalog' : '/wishlist' }}
            isFullWidth="mobile"
          >
            {openCycle !== null ? 'Смотреть каталог' : 'Собрать избранное'}
          </Button>

          <Button
            link={{ href: openCycle !== null ? '/orders' : '/catalog' }}
            variant="secondary"
            isFullWidth="mobile"
          >
            {openCycle !== null ? 'Мои заявки' : 'Смотреть каталог'}
          </Button>
        </>
      }
      note={note}
      showcase={showcase}
      showcaseMore={showcaseMore}
    />
  )
}

const HomePage: React.FC<IHomePageProps> = ({
  cycle,
  featured,
  productCount,
  categories,
  brands,
}) => {
  /*
    Приписка под кнопками — только объём каталога, счётчиками. Считаем по
    товарам в наличии: это та же выборка, что стоит в витрине, и обещать сотню
    позиций, половина которых кончилась, страница не должна. Каждый пустой
    счётчик опускается: «0 товаров» — не честность, а поломка. Не осталось
    ничего — приписки нет вовсе, пустой строкой место под ней не занимаем.
  */
  const heroNote =
    [
      productCount > 0 ? pluralize(productCount, ['товар', 'товара', 'товаров']) : null,
      brands.length > 0 ? pluralize(brands.length, ['бренд', 'бренда', 'брендов']) : null,
    ]
      .filter(part => part !== null)
      .join(' · ') || undefined

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
      <PageMeta title={SITE_TITLE} description={SITE_DESCRIPTION} path="/" />

      {/* Разметка секции «Что обычно спрашивают» — из того же массива, что и сама секция. */}
      <JsonLd data={faqLd(FAQ_ITEMS)} />

      <HomeTemplate
        hero={
          <div ref={heroRef}>
            <HeroCycle
              cycle={cycle}
              note={heroNote}
              background={<DecorField spots={HERO_SPOTS} containerRef={heroRef} />}
              /*
                Витрина прячется целиком, когда подборка пуста: три пустые
                карточки на первом экране читаются как поломка, а герой без
                `showcase` штатно раскладывается в одну колонку.
              */
              showcase={
                featured.length > 0
                  ? featured.slice(0, SHOWCASE_COUNT).map((product, index) => (
                      <Float
                        key={product.id}
                        phase={SHOWCASE_FLOAT[index]?.phase ?? 0}
                        distance={SHOWCASE_FLOAT[index]?.distance}
                      >
                        <ProductCard
                          product={product}
                          href={`/catalog/${product.slug}`}
                          sizes={SHOWCASE_SIZES}
                          /*
                            LCP первого экрана на десктопе: там витрина стоит
                            справа от заголовка, фотография крупнее него, и
                            ленивой браузер узнаёт о ней только после раскладки.
                            До `lg` витрина уезжает под текст и приоритет уже не
                            про LCP — но предзагрузка идёт по `sizes` (44vw),
                            то есть тянет ту же маленькую карточку, а не
                            десктопный размер.
                          */
                          isPriority={index === 0}
                          mediaAction={
                            <WishlistButton productId={product.id} productName={product.name} />
                          }
                        />
                      </Float>
                    ))
                  : undefined
              }
              /*
                Замыкает ленту на узком экране: последняя карточка там уезжает
                за край, и без плитки конец списка читается как обрыв. В
                кластере на десктопе герой прячет её сам.
              */
              showcaseMore={
                featured.length > 0 ? (
                  <ShowcaseMore
                    label="Смотреть каталог"
                    hint={
                      productCount > 0
                        ? pluralize(productCount, ['товар', 'товара', 'товаров'])
                        : undefined
                    }
                    link={{ href: '/catalog' }}
                  />
                ) : undefined
              }
            />
          </div>
        }
      >
        <HomeSection
          sectionRef={stepsRef}
          background={<DecorField spots={STEPS_SPOTS} containerRef={stepsRef} />}
        >
          <Reveal>
            <SectionHeading
              eyebrow="Как это работает"
              title="Заявка вместо оплаты"
              description="Онлайн-оплаты нет: всё, что нужно, - успеть до закрытия сбора"
            />
          </Reveal>

          <StepList steps={STEPS} />
        </HomeSection>

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
                description="Товары в наличии - состав каталога меняется перед каждым сбором"
                action={
                  <Button link={{ href: '/catalog' }} variant="secondary" size="sm">
                    Смотреть каталог
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
                product.inStock ? <AddToCartButton product={product} isCompact={true} /> : null
              }
              renderMediaAction={product => (
                <WishlistButton productId={product.id} productName={product.name} />
              )}
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
                description="Разделы каталога и бренды, которые в нём уже есть"
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
                title="Вход и подтверждение - в Telegram"
                description="Бот заводит аккаунт, подтверждает вход и присылает решение по заявке. Больше он ничего не делает и никуда не пишет."
                note="Оплата и доставка обсуждаются лично"
                actions={
                  <>
                    {/*
                      Чистая ссылка на бота, без `?start=`. Без настроенного имени
                      бота кнопке вести некуда, и она не рендерится.
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
