import type { StoryFn, Meta } from '@storybook/react'
import { ProductGrid } from '.'
import { feedProductGrid } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ProductGrid',
  component: ProductGrid,
} satisfies Meta<typeof ProductGrid>

const Template: StoryFn<typeof ProductGrid> = args => (
  <StoryWrapper>
    <ProductGrid {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductGrid()

/** Ждём новую выдачу: прошлые карточки на месте, но приглушены. */
export const Busy = Template.bind({})
Busy.args = { ...feedProductGrid(), isBusy: true }
