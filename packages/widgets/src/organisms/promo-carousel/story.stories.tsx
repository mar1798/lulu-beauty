import type { StoryFn, Meta } from '@storybook/react'
import { PromoCarousel } from '.'
import { feedPromoCarousel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/PromoCarousel',
  component: PromoCarousel,
} satisfies Meta<typeof PromoCarousel>

const Template: StoryFn<typeof PromoCarousel> = args => (
  <StoryWrapper>
    <PromoCarousel {...args} />
  </StoryWrapper>
)

/** Десктоп: рамка 3:1; второй слайд - только мобильный баннер, он кадрируется. */
export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = feedPromoCarousel()

/** Телефон 360px: рамка 3:2, свайп, зоны нажатия точек 44px. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = Default.args

/** Одна акция: ни точек, ни паузы, ни автопрокрутки. */
export const Single = Template.bind({})
Single.parameters = Default.parameters
Single.args = { ...feedPromoCarousel(), promotions: feedPromoCarousel().promotions.slice(0, 1) }
