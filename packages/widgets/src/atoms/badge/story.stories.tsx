import type { StoryFn, Meta } from '@storybook/react'
import { Badge } from '.'
import { feedBadge } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Badge',
  component: Badge,
} satisfies Meta<typeof Badge>

const Template: StoryFn<typeof Badge> = args => (
  <StoryWrapper>
    <Badge {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedBadge()
