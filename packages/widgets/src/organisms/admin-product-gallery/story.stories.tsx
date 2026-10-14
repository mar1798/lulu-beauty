import type { StoryFn, Meta } from '@storybook/react'
import { AdminProductGallery } from '.'
import { feedAdminProductGallery } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminProductGallery',
  component: AdminProductGallery,
} satisfies Meta<typeof AdminProductGallery>

const Template: StoryFn<typeof AdminProductGallery> = args => (
  <StoryWrapper>
    <AdminProductGallery {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAdminProductGallery()
