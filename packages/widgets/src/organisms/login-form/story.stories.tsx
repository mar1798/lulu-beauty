import type { StoryFn, Meta } from '@storybook/react'
import { LoginForm } from '.'
import { feedLoginForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/LoginForm',
  component: LoginForm,
} satisfies Meta<typeof LoginForm>

const Template: StoryFn<typeof LoginForm> = args => (
  <StoryWrapper>
    <LoginForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedLoginForm()
