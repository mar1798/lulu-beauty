import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { PasswordInput } from '.'
import { feedPasswordInput } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/PasswordInput',
  component: PasswordInput,
} satisfies Meta<typeof PasswordInput>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof PasswordInput> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <PasswordInput {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedPasswordInput()
