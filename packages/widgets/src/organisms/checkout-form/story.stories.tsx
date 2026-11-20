import type { StoryFn, Meta } from '@storybook/react'
import { PromoCodeField } from '../../molecules/promo-code-field'
import { CheckoutForm } from '.'
import {
  feedCheckoutForm,
  feedCheckoutFormWithPromotions,
  feedPromoCodeField,
} from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/CheckoutForm',
  component: CheckoutForm,
} satisfies Meta<typeof CheckoutForm>

const Template: StoryFn<typeof CheckoutForm> = args => (
  <StoryWrapper>
    <CheckoutForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCheckoutForm()

/** Скелетон вместо спиннера: раскладка известна заранее, страница не прыгает. */
export const Loading = Template.bind({})
Loading.parameters = Default.parameters
Loading.args = { ...feedCheckoutForm(), isLoading: true }

/** Со скидкой акции: «Товаров», строки скидок, «К оплате» и поле промокода. */
export const WithPromotions = Template.bind({})
WithPromotions.parameters = Default.parameters
WithPromotions.args = {
  ...feedCheckoutFormWithPromotions(),
  promoCode: <PromoCodeField {...feedPromoCodeField()} />,
}

export const WithPromotionsMobile = Template.bind({})
WithPromotionsMobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
WithPromotionsMobile.args = WithPromotions.args
