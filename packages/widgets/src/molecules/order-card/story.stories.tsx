import type { StoryFn, Meta } from '@storybook/react'
import { OrderCard } from '.'
import { feedOrderCard } from '../../stories/feed'
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
