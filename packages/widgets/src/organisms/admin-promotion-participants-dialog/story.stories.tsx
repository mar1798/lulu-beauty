import type { StoryFn, Meta } from '@storybook/react'
import { AdminPromotionParticipantsDialog } from '.'
import { feedAdminPromotionParticipantsDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminPromotionParticipantsDialog',
  component: AdminPromotionParticipantsDialog,
} satisfies Meta<typeof AdminPromotionParticipantsDialog>

const Template: StoryFn<typeof AdminPromotionParticipantsDialog> = args => (
  <StoryWrapper>
    <AdminPromotionParticipantsDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminPromotionParticipantsDialog()
