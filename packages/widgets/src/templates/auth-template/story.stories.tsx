import type { StoryFn, Meta } from '@storybook/react'
import { AuthTemplate } from '.'
import { feedAuthTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/AuthTemplate',
  component: AuthTemplate,
} satisfies Meta<typeof AuthTemplate>

const Template: StoryFn<typeof AuthTemplate> = args => (
  <StoryWrapper>
    <AuthTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedAuthTemplate()

/** Слот сезонного декора: плейсхолдер над верхним краем карточки, без места в потоке. */
export const WithDecor = Template.bind({})
WithDecor.parameters = {
  layout: 'padded',
}
WithDecor.args = {
  ...feedAuthTemplate(),
  decor: (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: 16,
        bottom: '100%',
        width: 77,
        height: 96,
        borderRadius: 8,
        background: '#d9534f',
        opacity: 0.7,
      }}
    />
  ),
}
