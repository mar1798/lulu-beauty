import type { StoryFn, Meta } from '@storybook/react'
import { CheckoutPanel } from '.'
import { CheckoutForm } from '../checkout-form'
import { ProductPicker } from '../product-picker'
import { PromoCodeField } from '../../molecules/promo-code-field'
import {
  feedCheckoutForm,
  feedCheckoutFormWithPromotions,
  feedCheckoutPanel,
  feedCheckoutPanelWithPromotions,
  feedProductPicker,
  feedPromoCodeField,
} from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/CheckoutPanel',
  component: CheckoutPanel,
} satisfies Meta<typeof CheckoutPanel>

const Template: StoryFn<typeof CheckoutPanel> = args => (
  <StoryWrapper>
    <CheckoutPanel {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.args = {
  ...feedCheckoutPanel(),
  form: <CheckoutForm {...feedCheckoutForm()} />,
}

/** Дозаказ: тот же подборщик, что и в уже поданной заявке. */
export const WithAddItem = Template.bind({})
WithAddItem.args = {
  ...feedCheckoutPanel(),
  form: <CheckoutForm {...feedCheckoutForm()} />,
  addItem: (
    <ProductPicker
      {...feedProductPicker()}
      label="Проверьте - возможно, вы что-то забыли"
      hint="Найденный товар попадёт в корзину и уйдёт в эту же заявку."
      addedLabel="Уже в корзине"
    />
  ),
}

/**
 * Правка количества на месте: степперы есть, крестика нет — убрать позицию
 * можно только в корзине, куда и ведёт ссылка у заголовка.
 */
export const Editable = Template.bind({})
Editable.args = {
  ...feedCheckoutPanel(),
  form: <CheckoutForm {...feedCheckoutForm()} />,
  onQuantityChange: () => undefined,
}

/** Отправка началась: состав уже уходит на сервер, степперы замерли. */
export const Submitting = Template.bind({})
Submitting.args = {
  ...feedCheckoutPanel(),
  form: <CheckoutForm {...feedCheckoutForm()} isSubmitting={true} />,
  onQuantityChange: () => undefined,
  isBusy: true,
}

/** Первая загрузка корзины: состав и форма рисуются скелетонами разом. */
export const Loading = Template.bind({})
Loading.args = {
  ...feedCheckoutPanel(),
  cart: null,
  isLoading: true,
  form: <CheckoutForm {...feedCheckoutForm()} isLoading={true} />,
}

/**
 * Акции и промокод: подарки идут за составом (акции, затем код), а форма считает
 * «К оплате» из ответа сервера и держит поле кода над комментарием.
 */
export const WithPromotions = Template.bind({})
WithPromotions.args = {
  ...feedCheckoutPanelWithPromotions(),
  form: (
    <CheckoutForm
      {...feedCheckoutFormWithPromotions()}
      code={{ code: 'K7M2XQ9R', discountCents: 20_000 }}
      promoCode={<PromoCodeField {...feedPromoCodeField()} />}
    />
  ),
}

export const WithPromotionsMobile = Template.bind({})
WithPromotionsMobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
WithPromotionsMobile.args = WithPromotions.args
