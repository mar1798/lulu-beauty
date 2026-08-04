import type { StoryFn, Meta } from '@storybook/react'
import { AccountTemplate } from '.'
import { feedAccountTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/AccountTemplate',
  component: AccountTemplate,
} satisfies Meta<typeof AccountTemplate>

const Template: StoryFn<typeof AccountTemplate> = args => (
  <StoryWrapper>
    <AccountTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAccountTemplate()
