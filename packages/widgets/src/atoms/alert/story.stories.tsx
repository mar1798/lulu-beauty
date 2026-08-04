import type { StoryFn, Meta } from '@storybook/react'
import { Alert } from '.'
import { feedAlert } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Alert',
  component: Alert,
} satisfies Meta<typeof Alert>

const Template: StoryFn<typeof Alert> = args => (
  <StoryWrapper>
    <Alert {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAlert()
