import type { StoryFn, Meta } from '@storybook/react'
import { AdminNewsBannerForm } from '.'
import { feedAdminNewsBannerForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminNewsBannerForm',
  component: AdminNewsBannerForm,
} satisfies Meta<typeof AdminNewsBannerForm>

const Template: StoryFn<typeof AdminNewsBannerForm> = args => (
  <StoryWrapper>
    <AdminNewsBannerForm {...args} />
  </StoryWrapper>
)

/** Новая новость: пустая форма, превью - заглушка заголовка. */
export const Create = Template.bind({})
Create.parameters = { layout: 'padded' }
Create.args = { onSubmit: () => {} }

/** Сохранённая новость: картинки уходят на сервер сразу. */
export const Edit = Template.bind({})
Edit.parameters = Create.parameters
Edit.args = feedAdminNewsBannerForm()

/** Ответ сервера с ошибкой под кнопкой. */
export const WithErrors = Template.bind({})
WithErrors.parameters = Create.parameters
WithErrors.args = {
  ...feedAdminNewsBannerForm(),
  error: 'Новостей не больше 20 - удалите ненужные',
  imageError: 'Подойдёт JPG, PNG или WebP',
}

/** Телефон: секции в одну колонку, превью 3:2. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = Edit.args
