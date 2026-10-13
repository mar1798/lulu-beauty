import type { StoryFn, Meta } from '@storybook/react'
import { AdminOrderDialog } from '.'
import { feedAdminOrderDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminOrderDialog',
  component: AdminOrderDialog,
} satisfies Meta<typeof AdminOrderDialog>

const Template: StoryFn<typeof AdminOrderDialog> = args => (
  <StoryWrapper>
    <AdminOrderDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAdminOrderDialog()
