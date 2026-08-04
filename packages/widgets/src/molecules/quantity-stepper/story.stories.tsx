import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { QuantityStepper } from '.'
import { feedQuantityStepper } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/QuantityStepper',
  component: QuantityStepper,
} satisfies Meta<typeof QuantityStepper>

/** Стори держит состояние сама: контрол управляемый. */
const Template: StoryFn<typeof QuantityStepper> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <QuantityStepper {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedQuantityStepper()
