import type { StoryFn, Meta } from '@storybook/react'
import { OrderItemRow } from '.'
import { feedOrderItemRow } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/OrderItemRow',
  component: OrderItemRow,
} satisfies Meta<typeof OrderItemRow>

const Template: StoryFn<typeof OrderItemRow> = args => (
  <StoryWrapper>
    <OrderItemRow {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedOrderItemRow()
