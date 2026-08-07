import type { StoryFn, Meta } from '@storybook/react'
import { ForgotPasswordForm } from '.'
import { feedForgotPasswordForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ForgotPasswordForm',
  component: ForgotPasswordForm,
} satisfies Meta<typeof ForgotPasswordForm>

const Template: StoryFn<typeof ForgotPasswordForm> = args => (
  <StoryWrapper>
    <ForgotPasswordForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedForgotPasswordForm()
