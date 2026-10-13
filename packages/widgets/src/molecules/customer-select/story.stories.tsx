import type { StoryFn, Meta } from '@storybook/react'
import { CustomerSelect } from '.'
import { feedCustomerSelect } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/CustomerSelect',
  component: CustomerSelect,
} satisfies Meta<typeof CustomerSelect>

const Template: StoryFn<typeof CustomerSelect> = args => (
  <StoryWrapper>
    <CustomerSelect {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedCustomerSelect()
