import type { StoryFn, Meta } from '@storybook/react'
import { Price } from '.'
import { feedPrice } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Price',
  component: Price,
} satisfies Meta<typeof Price>

const Template: StoryFn<typeof Price> = args => (
  <StoryWrapper>
    <Price {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedPrice()
