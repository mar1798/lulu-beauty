import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { CategoryFilter } from '.'
import { feedCategoryFilter } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/CategoryFilter',
  component: CategoryFilter,
} satisfies Meta<typeof CategoryFilter>

/** Стори держит состояние сама: контрол управляемый. */
const Template: StoryFn<typeof CategoryFilter> = args => {
  const [selectedSlug, setSelectedSlug] = useState(args.selectedSlug)

  return (
    <StoryWrapper>
      <CategoryFilter {...args} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedCategoryFilter()
