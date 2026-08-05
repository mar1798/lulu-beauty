import type { StoryFn, Meta } from '@storybook/react'
import { StatusSelect } from '.'
import { feedStatusSelect } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/StatusSelect',
  component: StatusSelect,
} satisfies Meta<typeof StatusSelect>

const Template: StoryFn<typeof StatusSelect> = args => (
  <StoryWrapper>
    <StatusSelect {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedStatusSelect()
