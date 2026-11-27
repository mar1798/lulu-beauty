import type { StoryFn, Meta } from '@storybook/react'
import { PromotionPeriodFields } from '.'
import { feedPromotionPeriodFields } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/PromotionPeriodFields',
  component: PromotionPeriodFields,
} satisfies Meta<typeof PromotionPeriodFields>

const Template: StoryFn<typeof PromotionPeriodFields> = args => (
  <StoryWrapper>
    <PromotionPeriodFields {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedPromotionPeriodFields()

export const OpenEnded = Template.bind({})
OpenEnded.parameters = { layout: 'centered' }
OpenEnded.args = { ...feedPromotionPeriodFields(), isOpenEnded: true }
