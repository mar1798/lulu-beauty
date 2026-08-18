import type { StoryFn, Meta } from '@storybook/react'
import { DecorField } from '.'
import { feedDecorField } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/DecorField',
  component: DecorField,
} satisfies Meta<typeof DecorField>

const Template: StoryFn<typeof DecorField> = args => (
  <StoryWrapper>
    <DecorField {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedDecorField()
