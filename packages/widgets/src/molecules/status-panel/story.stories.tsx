import type { StoryFn, Meta } from '@storybook/react'
import { StatusPanel } from '.'
import { feedStatusPanel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/StatusPanel',
  component: StatusPanel,
} satisfies Meta<typeof StatusPanel>

const Template: StoryFn<typeof StatusPanel> = args => (
  <StoryWrapper>
    <StatusPanel {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedStatusPanel()
