import type { StoryFn, Meta } from '@storybook/react'
import { Appear } from '.'
import { feedAppear } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Appear',
  component: Appear,
} satisfies Meta<typeof Appear>

const Template: StoryFn<typeof Appear> = args => (
  <StoryWrapper>
    <Appear {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedAppear()
