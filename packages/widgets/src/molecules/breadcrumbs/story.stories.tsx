import type { StoryFn, Meta } from '@storybook/react'
import { Breadcrumbs } from '.'
import { feedBreadcrumbs } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/Breadcrumbs',
  component: Breadcrumbs,
} satisfies Meta<typeof Breadcrumbs>

const Template: StoryFn<typeof Breadcrumbs> = args => (
  <StoryWrapper>
    <Breadcrumbs {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedBreadcrumbs()
