import type { StoryFn, Meta } from '@storybook/react'
import { ProductCard } from '.'
import { feedProductCard } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/ProductCard',
  component: ProductCard,
} satisfies Meta<typeof ProductCard>

const Template: StoryFn<typeof ProductCard> = args => (
  <StoryWrapper>
    <ProductCard {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductCard()
