import type { StoryFn, Meta } from '@storybook/react'
import { ProductGallery } from '.'
import { feedProductGallery } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/ProductGallery',
  component: ProductGallery,
} satisfies Meta<typeof ProductGallery>

const Template: StoryFn<typeof ProductGallery> = args => (
  <StoryWrapper>
    <ProductGallery {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductGallery()
