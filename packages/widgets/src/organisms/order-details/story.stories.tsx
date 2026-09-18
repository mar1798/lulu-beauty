import type { StoryFn, Meta } from '@storybook/react'
import { OrderDetails } from '.'
import { feedOrder, feedOrderDetails } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/OrderDetails',
  component: OrderDetails,
} satisfies Meta<typeof OrderDetails>

const Template: StoryFn<typeof OrderDetails> = args => (
  <StoryWrapper>
    <OrderDetails {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedOrderDetails()

/** Своя отмена при открытом сборе: она обратима, а не окончательна. */
export const Cancelled = Template.bind({})
Cancelled.parameters = { layout: 'centered' }
Cancelled.args = {
  ...feedOrderDetails(),
  order: feedOrder({ status: 'CANCELLED_BY_CUSTOMER', isEditable: false, isRestorable: true }),
  onRestore: () => undefined,
}

/**
 * Отмена владельца: возвращает её он сам, поэтому кнопки нет — вместо неё
 * объяснение, к кому идти. Пустая карточка тут читалась бы как поломка.
 */
export const CancelledByOwner = Template.bind({})
CancelledByOwner.parameters = { layout: 'centered' }
CancelledByOwner.args = {
  ...feedOrderDetails(),
  order: feedOrder({ status: 'CANCELLED_BY_OWNER', isEditable: false, isRestorable: false }),
  isCurrentCycle: true,
  onRestore: () => undefined,
}

/** Скелетон вместо спиннера: раскладка известна заранее, страница не прыгает. */
export const Loading = Template.bind({})
/* `padded`, а не `centered`: у скелетона нет содержимого, задающего ширину. */
Loading.parameters = { layout: 'padded' }
Loading.args = { ...feedOrderDetails(), order: null, isLoading: true }
