import type { StoryFn, Meta } from '@storybook/react'
import { AdminBannersBoard } from '.'
import { feedAdminBannersBoard } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminBannersBoard',
  component: AdminBannersBoard,
} satisfies Meta<typeof AdminBannersBoard>

const Template: StoryFn<typeof AdminBannersBoard> = args => (
  <StoryWrapper>
    <AdminBannersBoard {...args} />
  </StoryWrapper>
)

/** Смешанный список: показанные, скрытая, без баннера, выключенная акция, запланированная новость. */
export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = feedAdminBannersBoard()

/** Телефон: строки встают в столбик, горизонтальной прокрутки нет. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = Default.args

/** Загрузка. */
export const Loading = Template.bind({})
Loading.parameters = Default.parameters
Loading.args = { ...feedAdminBannersBoard(), items: [], isLoading: true }

/** Ничего нет: подсказка вместо списка. */
export const Empty = Template.bind({})
Empty.parameters = Default.parameters
Empty.args = {
  ...feedAdminBannersBoard(),
  items: [],
  emptyState: <p>Здесь появятся акции с баннерами и ваши новости</p>,
}

/** Всё скрыто: ни одна строка не в карусели. */
export const AllHidden = Template.bind({})
AllHidden.parameters = Default.parameters
AllHidden.args = {
  ...feedAdminBannersBoard(),
  items: feedAdminBannersBoard().items.map(item =>
    item.state === 'SHOWN' ? { ...item, state: 'HIDDEN', isShown: false } : item
  ),
}
