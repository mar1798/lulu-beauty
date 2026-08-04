import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Textarea } from '.'
import { feedTextarea } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Textarea',
  component: Textarea,
} satisfies Meta<typeof Textarea>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof Textarea> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <Textarea {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedTextarea()
