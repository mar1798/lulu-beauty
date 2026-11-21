import type { StoryFn, Meta } from '@storybook/react'
import { FormSection } from '.'
import { feedFormSection } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/FormSection',
  component: FormSection,
} satisfies Meta<typeof FormSection>

const Template: StoryFn<typeof FormSection> = args => (
  <StoryWrapper>
    <FormSection {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedFormSection()
