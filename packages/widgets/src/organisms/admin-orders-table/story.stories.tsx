import type { StoryFn, Meta } from '@storybook/react'
import { AdminOrdersTable } from '.'
import { feedAdminOrdersTable } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminOrdersTable',
  component: AdminOrdersTable,
} satisfies Meta<typeof AdminOrdersTable>

const Template: StoryFn<typeof AdminOrdersTable> = args => (
  <StoryWrapper>
    <AdminOrdersTable {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminOrdersTable()
