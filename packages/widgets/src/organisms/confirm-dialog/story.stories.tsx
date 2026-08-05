import type { StoryFn, Meta } from '@storybook/react'
import { ConfirmDialog } from '.'
import { feedConfirmDialog } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ConfirmDialog',
  component: ConfirmDialog,
} satisfies Meta<typeof ConfirmDialog>

const Template: StoryFn<typeof ConfirmDialog> = args => (
  <StoryWrapper>
    <ConfirmDialog {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedConfirmDialog()
