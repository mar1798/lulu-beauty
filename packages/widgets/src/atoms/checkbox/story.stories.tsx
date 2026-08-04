import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Checkbox } from '.'
import { feedCheckbox } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Checkbox',
  component: Checkbox,
} satisfies Meta<typeof Checkbox>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof Checkbox> = args => {
  const [checked, setChecked] = useState(args.checked)

  return (
    <StoryWrapper>
      <Checkbox {...args} checked={checked} onChange={setChecked} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedCheckbox()
