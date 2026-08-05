import type { StoryFn, Meta } from '@storybook/react'
import { AdminLayout } from '.'
import { feedAdminLayout } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/AdminLayout',
  component: AdminLayout,
} satisfies Meta<typeof AdminLayout>

const Template: StoryFn<typeof AdminLayout> = args => (
  <StoryWrapper>
    <AdminLayout {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminLayout()
