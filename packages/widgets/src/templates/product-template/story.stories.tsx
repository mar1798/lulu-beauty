import type { StoryFn, Meta } from '@storybook/react'
import { ProductTemplate } from '.'
import { feedProductTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/ProductTemplate',
  component: ProductTemplate,
} satisfies Meta<typeof ProductTemplate>

const Template: StoryFn<typeof ProductTemplate> = args => (
  <StoryWrapper>
    <ProductTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductTemplate()
