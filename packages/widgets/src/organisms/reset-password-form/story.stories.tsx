import type { StoryFn, Meta } from '@storybook/react'
import { ResetPasswordForm } from '.'
import { feedResetPasswordForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ResetPasswordForm',
  component: ResetPasswordForm,
} satisfies Meta<typeof ResetPasswordForm>

const Template: StoryFn<typeof ResetPasswordForm> = args => (
  <StoryWrapper>
    <ResetPasswordForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedResetPasswordForm()
