import type { StoryFn, Meta } from '@storybook/react'
import { VariantSelector } from '.'
import { feedVariantSelector } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/VariantSelector',
  component: VariantSelector,
} satisfies Meta<typeof VariantSelector>

const Template: StoryFn<typeof VariantSelector> = args => (
  <StoryWrapper>
    <VariantSelector {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedVariantSelector()
