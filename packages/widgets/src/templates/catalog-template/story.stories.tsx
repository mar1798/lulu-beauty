import type { StoryFn, Meta } from '@storybook/react'
import { CatalogTemplate } from '.'
import { feedCatalogTemplate } from '../../stories/feed'
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
