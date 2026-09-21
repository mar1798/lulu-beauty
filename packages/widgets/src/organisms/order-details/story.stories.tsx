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
  order: feedOrder({
    status: 'CANCELLED_BY_CUSTOMER',
    isEditable: false,
    isRestorable: true,
    isCancellable: false,
    pendingStage: null,
  }),
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
  order: feedOrder({
    status: 'CANCELLED_BY_OWNER',
    isEditable: false,
    isRestorable: false,
    isCancellable: false,
    pendingStage: null,
  }),
  isCurrentCycle: true,
  onRestore: () => undefined,
}

/**
 * Сбор закрыт, владелец закупает. Правки нет, но заявка ещё не куплена — значит
 * отозвать её можно, и карточка говорит, чего именно человек ждёт.
 */
export const Purchasing = Template.bind({})
Purchasing.parameters = { layout: 'centered' }
Purchasing.args = {
  ...feedOrderDetails(),
  order: feedOrder({ isEditable: false, pendingStage: 'PURCHASING' }),
  onCancel: () => undefined,
}

/**
 * Та же заявка спустя недели. Именно этот экран был пустым: бейдж «Ожидает
 * подтверждения» и ни слова под ним. Кнопок здесь снова нет — `isCancellable`
 * приходит `false`, — но теперь под шапкой сказано, что произошло и куда
 * написать: отменять нечего, отвечать по такой заявке магазину.
 */
export const Unfulfilled = Template.bind({})
Unfulfilled.parameters = { layout: 'centered' }
Unfulfilled.args = {
  ...feedOrderDetails(),
  order: feedOrder({ isEditable: false, isCancellable: false, pendingStage: 'UNFULFILLED' }),
  onCancel: () => undefined,
}

/** Скелетон вместо спиннера: раскладка известна заранее, страница не прыгает. */
export const Loading = Template.bind({})
/* `padded`, а не `centered`: у скелетона нет содержимого, задающего ширину. */
Loading.parameters = { layout: 'padded' }
Loading.args = { ...feedOrderDetails(), order: null, isLoading: true }
