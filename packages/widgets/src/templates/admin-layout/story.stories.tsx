import type { StoryFn, Meta } from '@storybook/react'
import { AdminLayout } from '.'
import { CategoryFilter } from '../../molecules/category-filter'
import { feedAdminLayout, feedCategoryFilter } from '../../stories/feed'
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

/** С фильтрами раздела: они встают в левую колонку под разделами. */
export const WithSidebar = Template.bind({})
WithSidebar.parameters = {
  layout: 'fullscreen',
}
WithSidebar.args = {
  ...feedAdminLayout(),
  sidebar: <CategoryFilter {...feedCategoryFilter()} />,
}
