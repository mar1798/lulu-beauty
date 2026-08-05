import type { StoryFn, Meta } from '@storybook/react'
import { AdminProductsTable } from '.'
import { feedAdminProductsTable } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminProductsTable',
  component: AdminProductsTable,
} satisfies Meta<typeof AdminProductsTable>

const Template: StoryFn<typeof AdminProductsTable> = args => (
  <StoryWrapper>
    <AdminProductsTable {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminProductsTable()
