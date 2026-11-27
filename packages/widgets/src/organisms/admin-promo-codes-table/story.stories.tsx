import type { StoryFn, Meta } from '@storybook/react'
import { AdminPromoCodesTable } from '.'
import { feedAdminPromoCodesTable } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminPromoCodesTable',
  component: AdminPromoCodesTable,
} satisfies Meta<typeof AdminPromoCodesTable>

const Template: StoryFn<typeof AdminPromoCodesTable> = args => (
  <StoryWrapper>
    <AdminPromoCodesTable {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedAdminPromoCodesTable()

/** Телефон 375px: основной вид раздела — строки таблицы раскладываются в карточки. */
export const Mobile = Template.bind({})
Mobile.parameters = {
  layout: 'fullscreen',
  viewport: { defaultViewport: 'mobile' },
}
Mobile.args = Default.args

export const Loading = Template.bind({})
Loading.parameters = { layout: 'fullscreen' }
Loading.args = { ...feedAdminPromoCodesTable(), isLoading: true }
