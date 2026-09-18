import type { StoryFn, Meta } from '@storybook/react'
import { HeaderSearch } from '.'
import { feedHeaderSearch } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/HeaderSearch',
  component: HeaderSearch,
} satisfies Meta<typeof HeaderSearch>

const Template: StoryFn<typeof HeaderSearch> = args => (
  <StoryWrapper>
    <HeaderSearch {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedHeaderSearch()
