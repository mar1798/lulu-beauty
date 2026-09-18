import type { StoryFn, Meta } from '@storybook/react'
import { LegalTemplate } from '.'
import { feedLegalTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/LegalTemplate',
  component: LegalTemplate,
} satisfies Meta<typeof LegalTemplate>

const Template: StoryFn<typeof LegalTemplate> = args => (
  <StoryWrapper>
    <LegalTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedLegalTemplate()
