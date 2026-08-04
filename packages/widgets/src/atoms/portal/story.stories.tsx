import type { StoryFn, Meta } from '@storybook/react'
import { Portal } from '.'
import { feedPortal } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Portal',
  component: Portal,
} satisfies Meta<typeof Portal>

const Template: StoryFn<typeof Portal> = args => (
  <StoryWrapper>
    <Portal {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedPortal()
