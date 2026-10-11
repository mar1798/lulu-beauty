import type { StoryFn, Meta } from '@storybook/react'
import { AdminMessageDialog } from '.'
import { feedAdminMessageDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminMessageDialog',
  component: AdminMessageDialog,
} satisfies Meta<typeof AdminMessageDialog>

const Template: StoryFn<typeof AdminMessageDialog> = args => (
  <StoryWrapper>
    <AdminMessageDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAdminMessageDialog()
