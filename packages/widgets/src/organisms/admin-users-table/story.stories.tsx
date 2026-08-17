import type { StoryFn, Meta } from '@storybook/react'
import { AdminUsersTable } from '.'
import { feedAdminUsersTable } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminUsersTable',
  component: AdminUsersTable,
} satisfies Meta<typeof AdminUsersTable>

const Template: StoryFn<typeof AdminUsersTable> = args => (
  <StoryWrapper>
    <AdminUsersTable {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.args = feedAdminUsersTable()

export const Loading = Template.bind({})
Loading.args = { ...feedAdminUsersTable(), users: [], isLoading: true }
