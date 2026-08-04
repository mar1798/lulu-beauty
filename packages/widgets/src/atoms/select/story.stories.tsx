import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Select } from '.'
import { feedSelect } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Select',
  component: Select,
} satisfies Meta<typeof Select>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof Select> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <Select {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedSelect()
