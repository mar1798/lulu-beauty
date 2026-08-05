import type { StoryFn, Meta } from '@storybook/react'
import { ProductPicker } from '.'
import { feedProductPicker } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ProductPicker',
  component: ProductPicker,
} satisfies Meta<typeof ProductPicker>

const Template: StoryFn<typeof ProductPicker> = args => (
  <StoryWrapper>
    <ProductPicker {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductPicker()

/** Пустой поиск: подсказка вместо «ничего не нашлось» — искать ещё не начинали. */
export const Idle = Template.bind({})
Idle.parameters = { layout: 'padded' }
Idle.args = { ...feedProductPicker(), query: '', products: null }

/** Скелетон только на первом запросе — прошлые результаты не мигают. */
export const Searching = Template.bind({})
Searching.parameters = { layout: 'padded' }
Searching.args = { ...feedProductPicker(), products: null, isSearching: true }

export const Empty = Template.bind({})
Empty.parameters = { layout: 'padded' }
Empty.args = { ...feedProductPicker(), products: [] }
