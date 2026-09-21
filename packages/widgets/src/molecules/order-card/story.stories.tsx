import type { StoryFn, Meta } from '@storybook/react'
import { OrderCard } from '.'
import { feedOrder, feedOrderCard } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/OrderCard',
  component: OrderCard,
} satisfies Meta<typeof OrderCard>

const Template: StoryFn<typeof OrderCard> = args => (
  <StoryWrapper>
    <OrderCard {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedOrderCard()

/**
 * Две ждущие заявки подряд — ради этой пары приписка и появилась: статус у них
 * один, а делать с ними можно разное.
 */
export const Waiting = Template.bind({})
Waiting.parameters = { layout: 'centered' }
Waiting.args = {
  ...feedOrderCard(),
  order: feedOrder({ isEditable: false, pendingStage: 'UNFULFILLED' }),
}
