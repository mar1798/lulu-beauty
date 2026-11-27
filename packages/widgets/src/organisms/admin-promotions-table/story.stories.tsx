import type { StoryFn, Meta } from '@storybook/react'
import { AdminPromotionsTable } from '.'
import { feedAdminPromotionsTable } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminPromotionsTable',
  component: AdminPromotionsTable,
} satisfies Meta<typeof AdminPromotionsTable>

const Template: StoryFn<typeof AdminPromotionsTable> = args => (
  <StoryWrapper>
    <AdminPromotionsTable {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedAdminPromotionsTable()

/** Телефон 375px: основной вид раздела — строки таблицы раскладываются в карточки. */
export const Mobile = Template.bind({})
Mobile.parameters = {
  layout: 'fullscreen',
  viewport: { defaultViewport: 'mobile' },
}
Mobile.args = Default.args

export const Loading = Template.bind({})
Loading.parameters = { layout: 'fullscreen' }
Loading.args = { ...feedAdminPromotionsTable(), isLoading: true }
