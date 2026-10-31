import type { StoryFn, Meta } from '@storybook/react'
import { AdminOrderEditDialog } from '.'
import { feedAdminOrderEditDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminOrderEditDialog',
  component: AdminOrderEditDialog,
} satisfies Meta<typeof AdminOrderEditDialog>

const Template: StoryFn<typeof AdminOrderEditDialog> = args => (
  <StoryWrapper>
    <AdminOrderEditDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAdminOrderEditDialog()
