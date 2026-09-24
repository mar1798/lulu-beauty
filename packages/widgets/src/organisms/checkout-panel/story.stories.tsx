import type { StoryFn, Meta } from '@storybook/react'
import { CheckoutPanel } from '.'
import { CheckoutForm } from '../checkout-form'
import { ProductPicker } from '../product-picker'
import { feedCheckoutForm, feedCheckoutPanel, feedProductPicker } from '../../stories/feed'
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
