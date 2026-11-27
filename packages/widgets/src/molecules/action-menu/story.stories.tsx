import type { StoryFn, Meta } from '@storybook/react'
import { ActionMenu } from '.'
import { feedActionMenu } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/ActionMenu',
  component: ActionMenu,
} satisfies Meta<typeof ActionMenu>

const Template: StoryFn<typeof ActionMenu> = args => (
  <StoryWrapper>
    <ActionMenu {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedActionMenu()
