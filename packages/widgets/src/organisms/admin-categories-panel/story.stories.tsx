import type { StoryFn, Meta } from '@storybook/react'
import { AdminCategoriesPanel } from '.'
import { feedAdminCategoriesPanel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminCategoriesPanel',
  component: AdminCategoriesPanel,
} satisfies Meta<typeof AdminCategoriesPanel>

const Template: StoryFn<typeof AdminCategoriesPanel> = args => (
  <StoryWrapper>
    <AdminCategoriesPanel {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminCategoriesPanel()
