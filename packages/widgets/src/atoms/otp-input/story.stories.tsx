import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { OtpInput } from '.'
import { feedOtpInput } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/OtpInput',
  component: OtpInput,
} satisfies Meta<typeof OtpInput>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof OtpInput> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <OtpInput {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedOtpInput()
