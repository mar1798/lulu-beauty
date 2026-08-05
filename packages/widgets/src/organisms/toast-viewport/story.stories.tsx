import type { StoryFn, Meta } from '@storybook/react'
import { ToastViewport } from '.'
import { feedToastViewport } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ToastViewport',
  component: ToastViewport,
} satisfies Meta<typeof ToastViewport>

const Template: StoryFn<typeof ToastViewport> = args => (
  <StoryWrapper>
    <ToastViewport {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedToastViewport()
