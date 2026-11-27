import type { StoryFn, Meta } from '@storybook/react'
import { PromotionDetails } from '.'
import { feedPromotionDetails, feedPublicPromotion } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/PromotionDetails',
  component: PromotionDetails,
} satisfies Meta<typeof PromotionDetails>

const Template: StoryFn<typeof PromotionDetails> = args => (
  <StoryWrapper>
    <PromotionDetails {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = feedPromotionDetails()

/** Телефон 360px: баннер 3:2, кнопка во всю ширину. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = Default.args

/** Без баннера, без описания и без условий. */
export const Bare = Template.bind({})
Bare.parameters = Default.parameters
Bare.args = {
  ...feedPromotionDetails(),
  promotion: feedPublicPromotion({
    bannerMobileUrl: null,
    bannerDesktopUrl: null,
    descriptionHtml: null,
    conditions: [],
    rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 5, target: null }],
  }),
}

/** Награда-промокод: выдаётся после оплаты. */
export const WithPromoCode = Template.bind({})
WithPromoCode.parameters = Default.parameters
WithPromoCode.args = {
  ...feedPromotionDetails(),
  promotion: feedPublicPromotion({
    rewards: [
      {
        type: 'PROMO_CODE',
        validDays: 30,
        validFrom: null,
        validUntil: null,
        conditions: [],
        rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 15, target: null }],
      },
    ],
  }),
}
