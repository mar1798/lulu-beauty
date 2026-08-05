import type { StoryFn, Meta } from '@storybook/react'
import { AdminProductForm } from '.'
import { feedAdminProductForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminProductForm',
  component: AdminProductForm,
} satisfies Meta<typeof AdminProductForm>

const Template: StoryFn<typeof AdminProductForm> = args => (
  <StoryWrapper>
    <AdminProductForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminProductForm()
