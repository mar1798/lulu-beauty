import type { StoryFn, Meta } from '@storybook/react'
import { Text } from '.'
import { feedText } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Text',
  component: Text,
} satisfies Meta<typeof Text>

const Template: StoryFn<typeof Text> = args => (
  <StoryWrapper>
    <Text {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedText()
