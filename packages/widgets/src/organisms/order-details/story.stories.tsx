import type { StoryFn, Meta } from '@storybook/react'
import { OrderDetails } from '.'
import { feedOrderDetails } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/OrderDetails',
  component: OrderDetails,
} satisfies Meta<typeof OrderDetails>

const Template: StoryFn<typeof OrderDetails> = args => (
  <StoryWrapper>
    <OrderDetails {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedOrderDetails()
