import type { StoryFn, Meta } from '@storybook/react'
import { HomeHero } from '.'
import { Button } from '../../atoms/button'
import { DeadlineCountdown } from '../../molecules/deadline-countdown'
import { StatusPanel } from '../../molecules/status-panel'
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
  aside: (
    <StatusPanel label="До закрытия сбора" isLive={true}>
      <DeadlineCountdown deadlineAt={deadlineAt} variant="blocks" isLabelHidden={true} />
    </StatusPanel>
  ),
}

/** Штатное состояние витрины, а не сбой: сбора может не быть неделями. */
export const NoCycle = Template.bind({})
NoCycle.parameters = LAYOUT
NoCycle.args = {
  ...feedHomeHero(),
  actions,
  aside: (
    <StatusPanel label="Сбор закрыт" tone="muted">
      Открытого сбора сейчас нет. Сохраняйте понравившееся в избранное — оттуда всё
      вернётся в корзину, когда откроется следующий.
    </StatusPanel>
  ),
}
