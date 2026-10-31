import type { StoryFn, Meta } from '@storybook/react'
import { AdminChecklistExtraDialog } from '.'
import { feedAdminChecklistExtraDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminChecklistExtraDialog',
  component: AdminChecklistExtraDialog,
} satisfies Meta<typeof AdminChecklistExtraDialog>

const Template: StoryFn<typeof AdminChecklistExtraDialog> = args => (
  <StoryWrapper>
    <AdminChecklistExtraDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAdminChecklistExtraDialog()
