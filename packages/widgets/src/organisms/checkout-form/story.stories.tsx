import type { StoryFn, Meta } from '@storybook/react'
import { CheckoutForm } from '.'
import { feedCheckoutForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/CheckoutForm',
  component: CheckoutForm,
} satisfies Meta<typeof CheckoutForm>

const Template: StoryFn<typeof CheckoutForm> = args => (
  <StoryWrapper>
    <CheckoutForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCheckoutForm()
