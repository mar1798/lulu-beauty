import type { StoryFn, Meta } from '@storybook/react'
import { Toast } from '.'
import { feedToast, feedToastOverflowing, feedToastWithAction } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/Toast',
  component: Toast,
} satisfies Meta<typeof Toast>

const Template: StoryFn<typeof Toast> = args => (
  <StoryWrapper>
    <Toast {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedToast()

/** Удаление: пока уведомление висит, товар можно вернуть одним нажатием. */
export const WithAction = Template.bind({})
WithAction.parameters = {
  layout: 'centered',
}
WithAction.args = feedToastWithAction()

/** Длинное название: две строки и многоточие, ширина тоста та же. */
export const LongTitle = Template.bind({})
LongTitle.parameters = {
  layout: 'centered',
}
LongTitle.args = feedToastOverflowing()
