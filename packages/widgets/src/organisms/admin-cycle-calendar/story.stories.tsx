import type { StoryFn, Meta } from '@storybook/react'
import { AdminCycleCalendar } from '.'
import { feedAdminCycleCalendar } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminCycleCalendar',
  component: AdminCycleCalendar,
} satisfies Meta<typeof AdminCycleCalendar>

const Template: StoryFn<typeof AdminCycleCalendar> = args => (
  <StoryWrapper>
    <AdminCycleCalendar {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedAdminCycleCalendar()
