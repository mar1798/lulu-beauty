import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Chip } from '.'
import { feedChip } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Chip',
  component: Chip,
} satisfies Meta<typeof Chip>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего ввести.
 */
const Template: StoryFn<typeof Chip> = args => {
  const [isSelected, setIsSelected] = useState(args.isSelected)

  return (
    <StoryWrapper>
      <Chip {...args} isSelected={isSelected} onToggle={setIsSelected} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedChip()
