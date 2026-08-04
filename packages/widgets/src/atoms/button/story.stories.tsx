import type { StoryFn, Meta } from '@storybook/react'
import { Button } from '.'
import { feedButton } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Button',
  component: Button,
} satisfies Meta<typeof Button>

const Template: StoryFn<typeof Button> = args => (
  <StoryWrapper>
    <Button {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedButton()
