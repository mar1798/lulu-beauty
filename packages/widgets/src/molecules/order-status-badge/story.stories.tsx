import type { StoryFn, Meta } from '@storybook/react'
import { OrderStatusBadge } from '.'
import { feedOrderStatusBadge } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/OrderStatusBadge',
  component: OrderStatusBadge,
} satisfies Meta<typeof OrderStatusBadge>

const Template: StoryFn<typeof OrderStatusBadge> = args => (
  <StoryWrapper>
    <OrderStatusBadge {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedOrderStatusBadge()
