import type { StoryFn, Meta } from '@storybook/react'
import { __name__ } from '.'
import { feed__name__ } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: '__component_type__s/__name__',
  component: __name__,
} satisfies Meta<typeof __name__>

const Template: StoryFn<typeof __name__> = args => (
  <StoryWrapper>
    <__name__ {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feed__name__()
