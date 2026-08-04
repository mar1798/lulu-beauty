import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Switch } from '.'
import { feedSwitch } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Switch',
  component: Switch,
} satisfies Meta<typeof Switch>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof Switch> = args => {
  const [checked, setChecked] = useState(args.checked)

  return (
    <StoryWrapper>
      <Switch {...args} checked={checked} onChange={setChecked} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedSwitch()
