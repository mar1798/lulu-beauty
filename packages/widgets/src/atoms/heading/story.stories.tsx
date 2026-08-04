import type { StoryFn, Meta } from '@storybook/react'
import { Heading } from '.'
import { feedHeading } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Heading',
  component: Heading,
} satisfies Meta<typeof Heading>

const Template: StoryFn<typeof Heading> = args => (
  <StoryWrapper>
    <Heading {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedHeading()
