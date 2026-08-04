import type { StoryFn, Meta } from '@storybook/react'
import { Header } from '.'
import { feedHeader } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/Header',
  component: Header,
} satisfies Meta<typeof Header>

const Template: StoryFn<typeof Header> = args => (
  <StoryWrapper>
    <Header {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedHeader()
