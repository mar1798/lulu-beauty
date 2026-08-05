import type { StoryFn, Meta } from '@storybook/react'
import { HomeTemplate } from '.'
import { feedHomeTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/HomeTemplate',
  component: HomeTemplate,
} satisfies Meta<typeof HomeTemplate>

const Template: StoryFn<typeof HomeTemplate> = args => (
  <StoryWrapper>
    <HomeTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedHomeTemplate()
