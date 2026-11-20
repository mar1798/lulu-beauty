import type { StoryFn, Meta } from '@storybook/react'
import { PromotionTargetField } from '.'
import { feedPromotionTargetField } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/PromotionTargetField',
  component: PromotionTargetField,
} satisfies Meta<typeof PromotionTargetField>

const Template: StoryFn<typeof PromotionTargetField> = args => (
  <StoryWrapper>
    <PromotionTargetField {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedPromotionTargetField()
