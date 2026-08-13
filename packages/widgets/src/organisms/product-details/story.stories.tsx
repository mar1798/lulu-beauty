import type { StoryFn, Meta } from '@storybook/react'
import { ProductDetails, ProductDetailsSkeleton } from '.'
import { feedProductDetails } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ProductDetails',
  component: ProductDetails,
} satisfies Meta<typeof ProductDetails>

const Template: StoryFn<typeof ProductDetails> = args => (
  <StoryWrapper>
    <ProductDetails {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductDetails()

/** Что видно на `/catalog/[slug]`, пока товар едет (`fallback: true`). */
export const Loading: StoryFn = () => (
  <StoryWrapper>
    <ProductDetailsSkeleton />
  </StoryWrapper>
)
Loading.parameters = {
  layout: 'padded',
}
