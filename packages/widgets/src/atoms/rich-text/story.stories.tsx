import type { StoryFn, Meta } from '@storybook/react'
import { RichText } from '.'
import { feedRichText } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/RichText',
  component: RichText,
} satisfies Meta<typeof RichText>

const Template: StoryFn<typeof RichText> = args => (
  <StoryWrapper>
    <RichText {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedRichText()
