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

/** Скелетон вместо спиннера: раскладка известна заранее, страница не прыгает. */
export const Loading = Template.bind({})
Loading.parameters = Default.parameters
Loading.args = { ...feedCheckoutForm(), isLoading: true }
