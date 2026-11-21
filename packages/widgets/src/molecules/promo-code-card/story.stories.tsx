import type { StoryFn, Meta } from '@storybook/react'
import { PromoCodeCard } from '.'
import { feedPromoCode, feedPromoCodeCard } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/PromoCodeCard',
  component: PromoCodeCard,
} satisfies Meta<typeof PromoCodeCard>

const Template: StoryFn<typeof PromoCodeCard> = args => (
  <StoryWrapper>
    <PromoCodeCard {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = feedPromoCodeCard()

export const Reserved = Template.bind({})
Reserved.parameters = Default.parameters
Reserved.args = {
  ...feedPromoCodeCard(),
  code: feedPromoCode({ status: 'RESERVED', usedOrderId: 'order-2' }),
}

export const Used = Template.bind({})
Used.parameters = Default.parameters
Used.args = {
  ...feedPromoCodeCard(),
  code: feedPromoCode({
    status: 'USED',
    usedOrderId: 'order-2',
    rewards: [
      {
        type: 'GIFT',
        gift: 'CUSTOM',
        title: 'Mystery box',
        imageUrl: null,
        variantId: null,
        quantity: 1,
      },
    ],
    conditions: [],
  }),
}

export const Expired = Template.bind({})
Expired.parameters = Default.parameters
Expired.args = { ...feedPromoCodeCard(), code: feedPromoCode({ status: 'EXPIRED' }) }

export const Revoked = Template.bind({})
Revoked.parameters = Default.parameters
Revoked.args = { ...feedPromoCodeCard(), code: feedPromoCode({ status: 'REVOKED' }) }

/** Телефон 360px: код переносится, кнопки во всю ширину, зоны нажатия от 44px. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = Default.args
