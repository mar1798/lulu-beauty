import type { StoryFn, Meta } from '@storybook/react'
import { StepList } from '.'
import { feedStepList } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/StepList',
  component: StepList,
} satisfies Meta<typeof StepList>

const Template: StoryFn<typeof StepList> = args => (
  <StoryWrapper>
    <StepList {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedStepList()
