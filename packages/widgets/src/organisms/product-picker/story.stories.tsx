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

/** Идёт поиск: полоски закрывают выдачу, пока она не про набранное. */
export const Searching = Template.bind({})
Searching.parameters = { layout: 'padded' }
/*
  С прошлой выдачей в пропсах намеренно: скелетон закрывает её на любом поиске,
  а не только на первом, — страница считает поиск начатым с первой буквы.
*/
Searching.args = { ...feedProductPicker(), isSearching: true }

export const Empty = Template.bind({})
Empty.parameters = { layout: 'padded' }
Empty.args = { ...feedProductPicker(), products: [] }
