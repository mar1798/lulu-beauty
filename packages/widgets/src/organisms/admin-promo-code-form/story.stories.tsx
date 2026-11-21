import type { StoryFn, Meta } from '@storybook/react'
import { AdminPromoCodeForm } from '.'
import { feedAdminPromoCodeForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminPromoCodeForm',
  component: AdminPromoCodeForm,
} satisfies Meta<typeof AdminPromoCodeForm>

const Template: StoryFn<typeof AdminPromoCodeForm> = args => (
  <StoryWrapper>
    <AdminPromoCodeForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAdminPromoCodeForm()

/** Сохранённый персональный код: поле кода с «Сгенерировать новый», выбранный покупатель. */
export const Saved = Template.bind({})
Saved.parameters = { layout: 'centered' }
Saved.args = {
  ...feedAdminPromoCodeForm(),
  isSaved: true,
  initialValues: {
    code: 'LETO2026',
    title: 'Скидка 10% для Айгуль',
    descriptionHtml: '<p>Спасибо, что с нами!</p>',
    startsAt: new Date(Date.now() - 86_400_000).toISOString(),
    endsAt: null,
    isEnabled: true,
    assignedUser: {
      id: 'u-1',
      name: 'Айгуль',
      phone: '+996700123456',
      telegramLinked: true,
      isDeleted: false,
    },
    conditions: [{ type: 'SUBTOTAL', minCents: 200_000, target: null }],
    rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null }],
  },
}

/** Телефон 375px. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile' } }
Mobile.args = feedAdminPromoCodeForm()
