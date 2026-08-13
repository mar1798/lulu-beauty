import type { StoryFn, Meta } from '@storybook/react'
import { AdminLayout } from '.'
import { CategoryFilter } from '../../molecules/category-filter'
import { feedAdminLayout, feedCategoryFilter, feedCategoryFilterMany } from '../../stories/feed'
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
  sidebar: <CategoryFilter {...feedCategoryFilter()} layout="column" />,
}

/**
 * Категорий больше, чем помещается по высоте: колонка упирается в край
 * экрана, и дальше прокручивается сам список фильтров, а разделы остаются на
 * месте. До ограничения высоты хвост списка уезжал под нижний край и был
 * недостижим — прилипший блок при прокрутке не двигается.
 */
export const WithLongSidebar = Template.bind({})
WithLongSidebar.parameters = {
  layout: 'fullscreen',
}
WithLongSidebar.args = {
  ...feedAdminLayout(),
  sidebar: <CategoryFilter {...feedCategoryFilterMany()} layout="column" />,
}
