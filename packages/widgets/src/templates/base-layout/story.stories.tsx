import type { StoryFn, Meta } from '@storybook/react'
import { BaseLayout } from '.'
import { feedBaseLayout } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/BaseLayout',
  component: BaseLayout,
} satisfies Meta<typeof BaseLayout>

const Template: StoryFn<typeof BaseLayout> = args => (
  <StoryWrapper>
    <BaseLayout {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedBaseLayout()
