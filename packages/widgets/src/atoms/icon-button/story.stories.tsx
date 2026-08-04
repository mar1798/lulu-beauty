import type { StoryFn, Meta } from '@storybook/react'
import { IconButton } from '.'
import { feedIconButton } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/IconButton',
  component: IconButton,
} satisfies Meta<typeof IconButton>

const Template: StoryFn<typeof IconButton> = args => (
  <StoryWrapper>
    <IconButton {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedIconButton()
