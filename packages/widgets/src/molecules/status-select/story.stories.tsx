import type { StoryFn, Meta } from '@storybook/react'
import { StatusSelect } from '.'
import { feedStatusSelect } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/StatusSelect',
  component: StatusSelect,
} satisfies Meta<typeof StatusSelect>

const Template: StoryFn<typeof StatusSelect> = args => (
  <StoryWrapper>
    <StatusSelect {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedStatusSelect()

/**
 * Отмена владельца: свою отмену он здесь же и снимает — в списке есть «Ожидает
 * подтверждения».
 */
export const CancelledByOwner = Template.bind({})
CancelledByOwner.parameters = { layout: 'centered' }
CancelledByOwner.args = { ...feedStatusSelect(), value: 'CANCELLED_BY_OWNER' as const }

/** Та же заявка, но опустевшая: возвращать в закупку нечего, и возврата в списке нет. */
export const CancelledAndEmpty = Template.bind({})
CancelledAndEmpty.parameters = { layout: 'centered' }
CancelledAndEmpty.args = {
  ...feedStatusSelect(),
  value: 'CANCELLED_BY_OWNER' as const,
  isEmpty: true,
}
