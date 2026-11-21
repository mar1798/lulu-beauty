import type { StoryFn, Meta } from '@storybook/react'
import { AdminPromotionForm } from '.'
import { feedAdminPromotionForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminPromotionForm',
  component: AdminPromotionForm,
} satisfies Meta<typeof AdminPromotionForm>

const Template: StoryFn<typeof AdminPromotionForm> = args => (
  <StoryWrapper>
    <AdminPromotionForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedAdminPromotionForm()

/** Телефон 375px: основной вид раздела — строки таблицы раскладываются в карточки. */
export const Mobile = Template.bind({})
Mobile.parameters = {
  layout: 'fullscreen',
  viewport: { defaultViewport: 'mobile' },
}
Mobile.args = Default.args

/** Создание: баннеры копятся в форме и уходят вместе с акцией. */
export const Create = Template.bind({})
Create.parameters = { layout: 'padded' }
Create.args = {
  ...feedAdminPromotionForm(),
  initialValues: undefined,
  savedBanners: undefined,
  onBannerUpload: undefined,
  onBannerRemove: undefined,
}
