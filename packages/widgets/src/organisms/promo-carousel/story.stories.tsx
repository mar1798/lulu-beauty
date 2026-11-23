import type { StoryFn, Meta } from '@storybook/react'
import { PromoCarousel } from '.'
import { feedBannerSlides, feedNewsTextSlide } from '../../stories/feed'
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

/** Десктоп: рамка 3:1; слайд без десктопного баннера кадрируется из мобильного. */
export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = { slides: feedBannerSlides() }

/** Телефон 360px: рамка 3:2, свайп, точки 24px. */
export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = Default.args

/** Только картинки: акции и новость с картинкой. */
export const ImagesOnly = Template.bind({})
ImagesOnly.parameters = Default.parameters
ImagesOnly.args = {
  slides: feedBannerSlides().filter(slide => slide.imageMobileUrl !== null),
}

/** Один слайд: ни точек, ни автопрокрутки. */
export const Single = Template.bind({})
Single.parameters = Default.parameters
Single.args = { slides: feedBannerSlides().slice(0, 1) }

/** Одна текстовая новость - без картинки. */
export const TextOnly = Template.bind({})
TextOnly.parameters = Default.parameters
TextOnly.args = { slides: [feedNewsTextSlide()] }

/** Текстовая новость на телефоне. */
export const TextOnlyMobile = Template.bind({})
TextOnlyMobile.parameters = Mobile.parameters
TextOnlyMobile.args = TextOnly.args
