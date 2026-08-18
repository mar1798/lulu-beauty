import type { StoryFn, Meta } from '@storybook/react'
import { Reveal } from '.'
import { feedReveal } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Reveal',
  component: Reveal,
} satisfies Meta<typeof Reveal>

const Template: StoryFn<typeof Reveal> = args => (
  <StoryWrapper>
    <Reveal {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedReveal()
