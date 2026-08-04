import type { StoryFn, Meta } from '@storybook/react'
import { EmptyState } from '.'
import { feedEmptyState } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/EmptyState',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>

const Template: StoryFn<typeof EmptyState> = args => (
  <StoryWrapper>
    <EmptyState {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedEmptyState()
