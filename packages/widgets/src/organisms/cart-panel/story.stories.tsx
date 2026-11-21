import type { StoryFn, Meta } from '@storybook/react'
import { CartPanel } from '.'
import { feedCartPanel, feedCartPanelWithPromotions } from '../../stories/feed'
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

/**
 * Акция сработала: подарок строкой после позиций, строка скидки, «К оплате» с
 * сервера и подсказка «ещё N сом» над итогом.
 */
export const WithPromotions = Template.bind({})
WithPromotions.parameters = Default.parameters
WithPromotions.args = feedCartPanelWithPromotions()

/** Телефон 360px: итог под составом, подсказка и скидки в одну колонку. */
export const WithPromotionsMobile = Template.bind({})
WithPromotionsMobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
WithPromotionsMobile.args = feedCartPanelWithPromotions()
