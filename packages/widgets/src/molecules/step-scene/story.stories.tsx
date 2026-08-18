import type { StoryFn, Meta } from '@storybook/react'
import { StepScene } from '.'
import { feedStepScene } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/StepScene',
  component: StepScene,
} satisfies Meta<typeof StepScene>

const Template: StoryFn<typeof StepScene> = args => (
  <StoryWrapper>
    <StepScene {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedStepScene()
