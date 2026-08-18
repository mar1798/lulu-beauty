import type { StoryFn, Meta } from '@storybook/react'
import { CategoryTiles } from '.'
import { feedCategoryTiles } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/CategoryTiles',
  component: CategoryTiles,
} satisfies Meta<typeof CategoryTiles>

const Template: StoryFn<typeof CategoryTiles> = args => (
  <StoryWrapper>
    <CategoryTiles {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedCategoryTiles()
