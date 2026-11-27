import type { StoryFn, Meta } from '@storybook/react'
import { PromotionRewardBuilder } from '.'
import { feedPromotionRewardBuilder } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/PromotionRewardBuilder',
  component: PromotionRewardBuilder,
} satisfies Meta<typeof PromotionRewardBuilder>

const Template: StoryFn<typeof PromotionRewardBuilder> = args => (
  <StoryWrapper>
    <PromotionRewardBuilder {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedPromotionRewardBuilder()

/** Телефон 375px: основной вид раздела — строки таблицы раскладываются в карточки. */
export const Mobile = Template.bind({})
Mobile.parameters = {
  layout: 'fullscreen',
  viewport: { defaultViewport: 'mobile' },
}
Mobile.args = Default.args
