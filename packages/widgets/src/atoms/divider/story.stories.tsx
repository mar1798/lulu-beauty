import type { StoryFn, Meta } from '@storybook/react'
import { Divider } from '.'
import { feedDivider } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Divider',
  component: Divider,
} satisfies Meta<typeof Divider>

const Template: StoryFn<typeof Divider> = args => (
  <StoryWrapper>
    <Divider {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedDivider()
