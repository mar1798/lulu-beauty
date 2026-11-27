import type { StoryFn, Meta } from '@storybook/react'
import { GiftLine } from '.'
import { feedCartGift, feedGiftLine } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/GiftLine',
  component: GiftLine,
} satisfies Meta<typeof GiftLine>

const Template: StoryFn<typeof GiftLine> = args => (
  <StoryWrapper>
    <GiftLine {...args} />
  </StoryWrapper>
)

/** Mystery box без картинки: заглушка-коробка. */
export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = feedGiftLine()

/** Подарок-товар с картинкой и количеством; длинное название ужимается в две строки. */
export const WithImage = Template.bind({})
WithImage.parameters = Default.parameters
WithImage.args = {
  gift: feedCartGift({
    kind: 'PRODUCT',
    title: 'Крем для рук с экстрактом центеллы азиатской, 50 мл, очень длинное название подарка',
    imageUrl:
      'data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%2260%22 height%3D%2260%22%3E%3Crect width%3D%2260%22 height%3D%2260%22 fill%3D%22%23f2d8e5%22%2F%3E%3C%2Fsvg%3E',
    quantity: 2,
  }),
  note: 'Акция «Весенняя распродажа»',
}

/** Телефон 360px: «Бесплатно» не переносится, название сжимается первым. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = WithImage.args
