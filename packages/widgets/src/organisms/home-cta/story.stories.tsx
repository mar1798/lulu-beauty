import type { StoryFn, Meta } from '@storybook/react'
import { HomeCta } from '.'
import { feedHomeCta } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/HomeCta',
  component: HomeCta,
} satisfies Meta<typeof HomeCta>

const Template: StoryFn<typeof HomeCta> = args => (
  <StoryWrapper>
    <HomeCta {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedHomeCta()

/** Декор идёт в существующий слот `background`: плейсхолдер в углу плашки, текст над ним. */
export const WithDecor = Template.bind({})
WithDecor.parameters = {
  layout: 'centered',
}
WithDecor.args = {
  ...feedHomeCta(),
  background: (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: 24,
        bottom: -8,
        width: 72,
        height: 72,
        borderRadius: 8,
        background: '#d9534f',
        opacity: 0.7,
      }}
    />
  ),
}
