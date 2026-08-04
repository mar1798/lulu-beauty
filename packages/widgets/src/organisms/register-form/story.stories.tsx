import type { StoryFn, Meta } from '@storybook/react'
import { RegisterForm } from '.'
import { feedRegisterForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/RegisterForm',
  component: RegisterForm,
} satisfies Meta<typeof RegisterForm>

const Template: StoryFn<typeof RegisterForm> = args => (
  <StoryWrapper>
    <RegisterForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedRegisterForm()
