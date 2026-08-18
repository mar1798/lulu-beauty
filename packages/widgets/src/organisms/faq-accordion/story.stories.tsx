import type { StoryFn, Meta } from '@storybook/react'
import { FaqAccordion } from '.'
import { feedFaqAccordion } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/FaqAccordion',
  component: FaqAccordion,
} satisfies Meta<typeof FaqAccordion>

const Template: StoryFn<typeof FaqAccordion> = args => (
  <StoryWrapper>
    <FaqAccordion {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedFaqAccordion()
