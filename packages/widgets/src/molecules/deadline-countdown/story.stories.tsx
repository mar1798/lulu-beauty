import type { StoryFn, Meta } from '@storybook/react'
import { DeadlineCountdown } from '.'
import { feedDeadlineCountdown } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/DeadlineCountdown',
  component: DeadlineCountdown,
} satisfies Meta<typeof DeadlineCountdown>

const Template: StoryFn<typeof DeadlineCountdown> = args => (
  <StoryWrapper>
    <DeadlineCountdown {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedDeadlineCountdown()
