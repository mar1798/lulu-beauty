import type { StoryFn, Meta } from '@storybook/react'
import { Footer } from '.'
import { feedFooter } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/Footer',
  component: Footer,
} satisfies Meta<typeof Footer>

const Template: StoryFn<typeof Footer> = args => (
  <StoryWrapper>
    <Footer {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedFooter()
