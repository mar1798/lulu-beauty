import type { StoryFn, Meta } from '@storybook/react'
import { PromotionConditionBuilder } from '.'
import { feedPromotionConditionBuilder } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/PromotionConditionBuilder',
  component: PromotionConditionBuilder,
} satisfies Meta<typeof PromotionConditionBuilder>

const Template: StoryFn<typeof PromotionConditionBuilder> = args => (
  <StoryWrapper>
    <PromotionConditionBuilder {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedPromotionConditionBuilder()

/** Телефон 375px: основной вид раздела — строки таблицы раскладываются в карточки. */
export const Mobile = Template.bind({})
Mobile.parameters = {
  layout: 'fullscreen',
  viewport: { defaultViewport: 'mobile' },
}
Mobile.args = Default.args
