import type { ReactNode } from 'react'
import type { StoryFn, Meta } from '@storybook/react'
import { StepList } from '.'
import { feedStepList } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/StepList',
  component: StepList,
} satisfies Meta<typeof StepList>

const Template: StoryFn<typeof StepList> = args => (
  <StoryWrapper>
    <StepList {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedStepList()

const placeholder = (width: number, height: number): ReactNode => (
  <span
    aria-hidden="true"
    style={{
      display: 'block',
      width,
      height,
      borderRadius: 8,
      background: '#d9534f',
      opacity: 0.7,
    }}
  />
)

/** Слот иконки шага: плейсхолдер вместо сезонного рисунка, раскладка карточек не меняется. */
export const WithIcons = Template.bind({})
WithIcons.parameters = {
  layout: 'padded',
}
WithIcons.args = {
  ...feedStepList(),
  renderIcon: () => placeholder(40, 56),
}
