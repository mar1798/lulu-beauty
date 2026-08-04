import type { StoryFn, Meta } from '@storybook/react'
import { Skeleton } from '.'
import { feedSkeleton } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>

const Template: StoryFn<typeof Skeleton> = args => (
  <StoryWrapper>
    <Skeleton {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedSkeleton()
