import type { StoryFn, Meta } from '@storybook/react'
import { AdminPromoCodeDialog } from '.'
import { feedAdminPromoCodeDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminPromoCodeDialog',
  component: AdminPromoCodeDialog,
} satisfies Meta<typeof AdminPromoCodeDialog>

const Template: StoryFn<typeof AdminPromoCodeDialog> = args => (
  <StoryWrapper>
    <AdminPromoCodeDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminPromoCodeDialog()
