import type { StoryFn, Meta } from '@storybook/react'
import { HomeHero } from '.'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { Float } from '../../atoms/float'
import { DeadlineCountdown } from '../../molecules/deadline-countdown'
import { ProductCard } from '../../molecules/product-card'
import { ShowcaseMore } from '../../molecules/showcase-more'
import { StatusPanel } from '../../molecules/status-panel'
import { feedHomeHero, feedProduct } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/HomeHero',
  component: HomeHero,
} satisfies Meta<typeof HomeHero>

const Template: StoryFn<typeof HomeHero> = args => (
  <StoryWrapper>
    <HomeHero {...args} />
  </StoryWrapper>
)

const LAYOUT = { layout: 'fullscreen' }

/** Дедлайн через двое суток — фикстура должна пережить любой день прогона. */
const DAY_MS = 24 * 60 * 60 * 1000
const deadlineAt = new Date(Date.now() + 2 * DAY_MS).toISOString()

const actions = (
  <>
    <Button link={{ href: '/catalog' }} isFullWidth="mobile">
      Смотреть каталог
    </Button>

    <Button link={{ href: '/orders' }} variant="secondary" isFullWidth="mobile">
      Мои заявки
    </Button>
  </>
)

/**
 * Левитация карточек: у каждой своя фаза И своя амплитуда. Не по возрастанию —
 * соседние по ряду карточки должны расходиться сильнее, чем крайние между
 * собой, иначе кластер качается волной слева направо и читается как один
 * объект, а не как три.
 */
const FLOAT = [
  { phase: 0, distance: 5 },
  { phase: 0.62, distance: 2 },
  { phase: 0.28, distance: 4 },
]

const showcase = FLOAT.map(({ phase, distance }, index) => {
  const product = feedProduct()

  return (
    <Float key={product.id} phase={phase} distance={distance}>
      <ProductCard
        product={product}
        href={`/catalog/${product.slug}`}
        categoryName="Уход за кожей"
        sizes={{ fb: '44vw', lg: '15vw' }}
        isPriority={index === 0}
      />
    </Float>
  )
})

/** Видна только в ленте — до `lg` герой раскладывается в одну колонку. */
const showcaseMore = (
  <ShowcaseMore label="Смотреть каталог" hint="214 товаров" link={{ href: '/catalog' }} />
)

export const CycleOpen = Template.bind({})
CycleOpen.parameters = LAYOUT
CycleOpen.args = {
  ...feedHomeHero(),
  badge: <Badge tone="brand">Сбор открыт</Badge>,
  status: (
    <StatusPanel label="До закрытия сбора" isLive={true}>
      <DeadlineCountdown deadlineAt={deadlineAt} variant="blocks" isLabelHidden={true} />
    </StatusPanel>
  ),
  actions,
  showcase,
  showcaseMore,
}

/** Штатное состояние витрины, а не сбой: сбора может не быть неделями. */
export const NoCycle = Template.bind({})
NoCycle.parameters = LAYOUT
NoCycle.args = {
  ...feedHomeHero(),
  badge: <Badge tone="neutral">Сбора сейчас нет</Badge>,
  status: (
    <StatusPanel label="Следующий сбор откроется - бот сообщит" tone="muted">
      Каталог открыт всегда. Сохраняйте понравившееся в избранное - список дождётся следующего
      сбора.
    </StatusPanel>
  ),
  actions: (
    <Button link={{ href: '/wishlist' }} isFullWidth="mobile">
      Собрать избранное
    </Button>
  ),
  showcase,
  showcaseMore,
}

/**
 * Витрины нет — герой обязан остаться одноколоночным, а не ужимать текст в
 * половину экрана ради пустого места рядом. Так он выглядит в Storybook без
 * страницы и так же выглядел бы на главной, где подборка пуста.
 */
export const WithoutShowcase = Template.bind({})
WithoutShowcase.parameters = LAYOUT
WithoutShowcase.args = {
  ...feedHomeHero(),
  badge: <Badge tone="brand">Сбор открыт</Badge>,
  actions,
}
