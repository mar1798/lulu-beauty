import type { StoryFn, Meta } from '@storybook/react'
import { OrderList } from '.'
import { feedOrderList } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/OrderList',
  component: OrderList,
} satisfies Meta<typeof OrderList>

const Template: StoryFn<typeof OrderList> = args => (
  <StoryWrapper>
    <OrderList {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedOrderList()
