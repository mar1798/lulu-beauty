import type { StoryFn, Meta } from '@storybook/react'
import { MobileMenu } from '.'
import { feedMobileMenu } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/MobileMenu',
  component: MobileMenu,
} satisfies Meta<typeof MobileMenu>

const Template: StoryFn<typeof MobileMenu> = args => (
  <StoryWrapper>
    <MobileMenu {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedMobileMenu()
