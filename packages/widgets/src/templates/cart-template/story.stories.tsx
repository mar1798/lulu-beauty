import type { StoryFn, Meta } from '@storybook/react'
import { CartTemplate } from '.'
import { feedCartTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/CartTemplate',
  component: CartTemplate,
} satisfies Meta<typeof CartTemplate>

const Template: StoryFn<typeof CartTemplate> = args => (
  <StoryWrapper>
    <CartTemplate {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedCartTemplate()

/** Слот у заголовка: плейсхолдер вместо сезонного рисунка, высота строки не меняется. */
export const WithTitleDecor = Template.bind({})
WithTitleDecor.parameters = {
  layout: 'padded',
}
WithTitleDecor.args = {
  ...feedCartTemplate(),
  titleDecor: (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width: 29,
        height: 40,
        borderRadius: 8,
        background: '#d9534f',
        opacity: 0.7,
      }}
    />
  ),
}

/** Слой декора у блока заголовка: плейсхолдер справа внизу, раскладка не меняется. */
export const WithDecor = Template.bind({})
WithDecor.parameters = {
  layout: 'padded',
}
WithDecor.args = {
  ...feedCartTemplate(),
  decor: (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 120,
        height: 96,
        borderRadius: 8,
        background: '#5cb85c',
        opacity: 0.7,
      }}
    />
  ),
}
