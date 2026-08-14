import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { CategoryFilter } from '.'
import { feedCategoryFilter, feedCategoryFilterMany } from '../../stories/feed'
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
      <div style={{ width: 220 }}>
        <CategoryFilter {...args} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
      </div>
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedCategoryFilter()

/**
 * Категорий больше, чем помещается в список: дальше `Select` упирается в свой
 * потолок высоты и прокручивается внутри, а длинные названия обрезаются
 * многоточием, а не растягивают поле.
 */
export const ManyCategories = Template.bind({})
ManyCategories.parameters = {
  layout: 'centered',
}
ManyCategories.args = feedCategoryFilterMany()
