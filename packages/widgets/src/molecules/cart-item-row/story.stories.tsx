import type { StoryFn, Meta } from '@storybook/react'
import { CartItemRow } from '.'
import { feedCartItemRow } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/CartItemRow',
  component: CartItemRow,
} satisfies Meta<typeof CartItemRow>

const Template: StoryFn<typeof CartItemRow> = args => (
  <StoryWrapper>
    <CartItemRow {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCartItemRow()
