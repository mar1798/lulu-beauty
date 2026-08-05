import type { StoryFn, Meta } from '@storybook/react'
import { SectionHeading } from '.'
import { Button } from '../../atoms/button'
import { feedSectionHeading } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/SectionHeading',
  component: SectionHeading,
} satisfies Meta<typeof SectionHeading>

const Template: StoryFn<typeof SectionHeading> = args => (
  <StoryWrapper>
    <SectionHeading {...args} />
  </StoryWrapper>
)

const LAYOUT = { layout: 'padded' }

export const Default = Template.bind({})
Default.parameters = LAYOUT
Default.args = feedSectionHeading()

export const WithAction = Template.bind({})
WithAction.parameters = LAYOUT
WithAction.args = {
  ...feedSectionHeading(),
  action: (
    <Button link={{ href: '/catalog' }} variant="secondary" size="sm">
      Весь каталог
    </Button>
  ),
}
