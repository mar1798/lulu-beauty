import type { StoryFn, Meta } from '@storybook/react'
import { AdminOrderDiscountDialog } from '.'
import { feedAdminOrderDiscountDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminOrderDiscountDialog',
  component: AdminOrderDiscountDialog,
} satisfies Meta<typeof AdminOrderDiscountDialog>

const Template: StoryFn<typeof AdminOrderDiscountDialog> = args => (
  <StoryWrapper>
    <AdminOrderDiscountDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAdminOrderDiscountDialog()
