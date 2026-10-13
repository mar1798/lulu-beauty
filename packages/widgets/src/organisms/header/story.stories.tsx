import type { StoryFn, Meta } from '@storybook/react'
import { Header } from '.'
import { feedHeader } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/Header',
  component: Header,
} satisfies Meta<typeof Header>

const Template: StoryFn<typeof Header> = args => (
  <StoryWrapper>
    <Header {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedHeader()

/** Подпись у логотипа — над названием, наискосок, как на сайте в сезон. */
export const WithLogoNote = Template.bind({})
WithLogoNote.parameters = {
  layout: 'fullscreen',
}
WithLogoNote.args = {
  ...feedHeader(),
  logoNote: (
    <span
      style={{
        position: 'absolute',
        top: -9,
        left: 14,
        fontSize: 10,
        color: '#b4531b',
        whiteSpace: 'nowrap',
        transform: 'rotate(-7deg)',
      }}
    >
      Happy Halloween
    </span>
  ),
}
