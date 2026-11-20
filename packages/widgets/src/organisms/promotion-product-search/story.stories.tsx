import type { StoryFn, Meta } from '@storybook/react'
import { PromotionProductSearch } from '.'
import { feedPromotionProductSearch } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/PromotionProductSearch',
  component: PromotionProductSearch,
} satisfies Meta<typeof PromotionProductSearch>

const Template: StoryFn<typeof PromotionProductSearch> = args => (
  <StoryWrapper>
    <PromotionProductSearch {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedPromotionProductSearch()
