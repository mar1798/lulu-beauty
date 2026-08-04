import type { StoryFn, Meta } from '@storybook/react'
import { CartPanel } from '.'
import { feedCartPanel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/CartPanel',
  component: CartPanel,
} satisfies Meta<typeof CartPanel>

const Template: StoryFn<typeof CartPanel> = args => (
  <StoryWrapper>
    <CartPanel {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCartPanel()
