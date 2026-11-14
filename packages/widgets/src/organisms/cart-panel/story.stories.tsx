import type { StoryFn, Meta } from '@storybook/react'
import { CartPanel } from '.'
import { feedCartPanel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/CartPanel',
  component: CartPanel,
} satisfies Meta<typeof CartPanel>

const Template: StoryFn<typeof CartPanel> = args => (
  <StoryWrapper>
    <CartPanel {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCartPanel()

/** Скелетон вместо спиннера: раскладка известна заранее, страница не прыгает. */
export const Loading = Template.bind({})
Loading.parameters = Default.parameters
Loading.args = { ...feedCartPanel(), cart: null, isLoading: true }

/** Гость: корзина в браузере, перед отправкой будет вход через Telegram. */
export const Guest = Template.bind({})
Guest.parameters = Default.parameters
Guest.args = {
  ...feedCartPanel(),
  checkoutLabel: 'Войти и оформить',
  checkoutNote: 'Для отправки заявки войдите через Telegram - корзина перенесётся в аккаунт',
}
