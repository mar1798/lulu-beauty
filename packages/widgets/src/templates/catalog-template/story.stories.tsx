import type { StoryFn, Meta } from '@storybook/react'
import { CatalogTemplate } from '.'
import { PromoCarousel } from '../../organisms/promo-carousel'
import { feedCatalogTemplate, feedPromoCarousel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/CatalogTemplate',
  component: CatalogTemplate,
} satisfies Meta<typeof CatalogTemplate>

const Template: StoryFn<typeof CatalogTemplate> = args => (
  <StoryWrapper>
    <CatalogTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCatalogTemplate()

/** Карусель акций над заголовком каталога. */
export const WithPromoCarousel = Template.bind({})
WithPromoCarousel.parameters = { layout: 'padded' }
WithPromoCarousel.args = {
  ...feedCatalogTemplate(),
  banner: <PromoCarousel {...feedPromoCarousel()} />,
}
