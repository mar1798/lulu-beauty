import type { StoryFn, Meta } from '@storybook/react'
import { Toast } from '.'
import { feedToast } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/Toast',
  component: Toast,
} satisfies Meta<typeof Toast>

const Template: StoryFn<typeof Toast> = args => (
  <StoryWrapper>
    <Toast {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedToast()
