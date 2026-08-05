import type { StoryFn, Meta } from '@storybook/react'
import { HomeHero } from '.'
import { Button } from '../../atoms/button'
import { Text } from '../../atoms/text'
import { DeadlineCountdown } from '../../molecules/deadline-countdown'
import { feedHomeHero } from '../../stories/feed'
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

const LAYOUT = { layout: 'padded' }

/** Дедлайн через двое суток — фикстура должна пережить любой день прогона. */
const DAY_MS = 24 * 60 * 60 * 1000
const deadlineAt = new Date(Date.now() + 2 * DAY_MS).toISOString()

const actions = (
  <>
    <Button link={{ href: '/catalog' }}>Смотреть каталог</Button>

    <Button link={{ href: '/register' }} variant="secondary">
      Зарегистрироваться
    </Button>
  </>
)

export const CycleOpen = Template.bind({})
CycleOpen.parameters = LAYOUT
CycleOpen.args = {
  ...feedHomeHero(),
  actions,
  aside: <DeadlineCountdown deadlineAt={deadlineAt} />,
}

/** Штатное состояние витрины, а не сбой: сбора может не быть неделями. */
export const NoCycle = Template.bind({})
NoCycle.parameters = LAYOUT
NoCycle.args = {
  ...feedHomeHero(),
  eyebrow: 'Сбор закрыт',
  actions,
  aside: (
    <Text size="sm" tone="secondary">
      Сейчас открытого сбора нет. Соберите корзину — она дождётся следующего.
    </Text>
  ),
}
