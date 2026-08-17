import type { StoryFn, Meta } from '@storybook/react'
import { ItemRow } from '.'
import { feedItemRow } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/ItemRow',
  component: ItemRow,
} satisfies Meta<typeof ItemRow>

const Template: StoryFn<typeof ItemRow> = args => (
  <StoryWrapper>
    <ItemRow {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedItemRow()

/** Режим правки — так строка выглядит в корзине и в открытой заявке. */
export const Editable = Template.bind({})
Editable.parameters = {
  layout: 'centered',
}
Editable.args = {
  ...feedItemRow(),
  onQuantityChange: () => undefined,
  onRemove: () => undefined,
  removeLabel: 'Убрать из корзины',
}
