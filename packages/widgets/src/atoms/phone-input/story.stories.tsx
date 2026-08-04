import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { PhoneInput } from '.'
import { feedPhoneInput } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/PhoneInput',
  component: PhoneInput,
} satisfies Meta<typeof PhoneInput>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof PhoneInput> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <PhoneInput {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedPhoneInput()
