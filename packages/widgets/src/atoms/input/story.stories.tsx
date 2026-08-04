import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Input } from '.'
import { feedInput } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Input',
  component: Input,
} satisfies Meta<typeof Input>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof Input> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <Input {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedInput()
