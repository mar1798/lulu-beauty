import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { SearchField } from '.'
import { feedSearchField } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/SearchField',
  component: SearchField,
} satisfies Meta<typeof SearchField>

/** Стори держит состояние сама: контрол управляемый. */
const Template: StoryFn<typeof SearchField> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <SearchField {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedSearchField()
