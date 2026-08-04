import type { StoryFn, Meta } from '@storybook/react'
import { OtpVerifyForm } from '.'
import { feedOtpVerifyForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/OtpVerifyForm',
  component: OtpVerifyForm,
} satisfies Meta<typeof OtpVerifyForm>

const Template: StoryFn<typeof OtpVerifyForm> = args => (
  <StoryWrapper>
    <OtpVerifyForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedOtpVerifyForm()
