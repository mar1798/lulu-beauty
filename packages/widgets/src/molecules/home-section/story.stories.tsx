import type { StoryFn, Meta } from '@storybook/react'
import { HomeSection } from '.'
import { feedHomeSection } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/HomeSection',
  component: HomeSection,
} satisfies Meta<typeof HomeSection>

const Template: StoryFn<typeof HomeSection> = args => (
  <StoryWrapper>
    <HomeSection {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedHomeSection()
