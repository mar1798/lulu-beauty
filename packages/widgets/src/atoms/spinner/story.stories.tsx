import type { StoryFn, Meta } from '@storybook/react'
import { Spinner } from '.'
import { feedSpinner } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Spinner',
  component: Spinner,
} satisfies Meta<typeof Spinner>

const Template: StoryFn<typeof Spinner> = args => (
  <StoryWrapper>
    <Spinner {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedSpinner()
