import type { StoryFn, Meta } from '@storybook/react'
import { VisuallyHidden } from '.'
import { feedVisuallyHidden } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/VisuallyHidden',
  component: VisuallyHidden,
} satisfies Meta<typeof VisuallyHidden>

const Template: StoryFn<typeof VisuallyHidden> = args => (
  <StoryWrapper>
    <VisuallyHidden {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedVisuallyHidden()
