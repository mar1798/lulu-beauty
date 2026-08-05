import type { StoryFn, Meta } from '@storybook/react'
import { AdminImportPanel } from '.'
import { feedAdminImportPanel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminImportPanel',
  component: AdminImportPanel,
} satisfies Meta<typeof AdminImportPanel>

const Template: StoryFn<typeof AdminImportPanel> = args => (
  <StoryWrapper>
    <AdminImportPanel {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminImportPanel()
