import type { StoryFn, Meta } from '@storybook/react'
import { Container } from '.'
import { feedContainer } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Container',
  component: Container,
} satisfies Meta<typeof Container>

const Template: StoryFn<typeof Container> = args => (
  <StoryWrapper>
    <Container {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedContainer()
