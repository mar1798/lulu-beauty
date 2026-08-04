import type { StoryFn, Meta } from '@storybook/react'
import { CartTemplate } from '.'
import { feedCartTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/CartTemplate',
  component: CartTemplate,
} satisfies Meta<typeof CartTemplate>

const Template: StoryFn<typeof CartTemplate> = args => (
  <StoryWrapper>
    <CartTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCartTemplate()
