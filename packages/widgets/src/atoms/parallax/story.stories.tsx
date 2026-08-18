import type { StoryFn, Meta } from '@storybook/react'
import { Parallax } from '.'
import { feedParallax } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Parallax',
  component: Parallax,
} satisfies Meta<typeof Parallax>

const Template: StoryFn<typeof Parallax> = args => (
  <StoryWrapper>
    <Parallax {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedParallax()
