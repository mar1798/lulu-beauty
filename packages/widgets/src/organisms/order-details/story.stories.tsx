import type { StoryFn, Meta } from '@storybook/react'
import { OrderDetails } from '.'
import { feedOrderDetails } from '../../stories/feed'
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

/** Скелетон вместо спиннера: раскладка известна заранее, страница не прыгает. */
export const Loading = Template.bind({})
/* `padded`, а не `centered`: у скелетона нет содержимого, задающего ширину. */
Loading.parameters = { layout: 'padded' }
Loading.args = { ...feedOrderDetails(), order: null, isLoading: true }
