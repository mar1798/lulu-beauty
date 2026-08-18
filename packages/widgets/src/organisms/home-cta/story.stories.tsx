import type { StoryFn, Meta } from '@storybook/react'
import { HomeCta } from '.'
import { feedHomeCta } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/HomeCta',
  component: HomeCta,
} satisfies Meta<typeof HomeCta>

const Template: StoryFn<typeof HomeCta> = args => (
  <StoryWrapper>
    <HomeCta {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedHomeCta()
