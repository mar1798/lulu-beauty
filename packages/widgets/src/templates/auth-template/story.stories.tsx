import type { StoryFn, Meta } from '@storybook/react'
import { AuthTemplate } from '.'
import { feedAuthTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/AuthTemplate',
  component: AuthTemplate,
} satisfies Meta<typeof AuthTemplate>

const Template: StoryFn<typeof AuthTemplate> = args => (
  <StoryWrapper>
    <AuthTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedAuthTemplate()
