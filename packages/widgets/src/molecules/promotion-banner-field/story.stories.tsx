import type { StoryFn, Meta } from '@storybook/react'
import { PromotionBannerField } from '.'
import { feedPromotionBannerField } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/PromotionBannerField',
  component: PromotionBannerField,
} satisfies Meta<typeof PromotionBannerField>

const Template: StoryFn<typeof PromotionBannerField> = args => (
  <StoryWrapper>
    <PromotionBannerField {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedPromotionBannerField()
