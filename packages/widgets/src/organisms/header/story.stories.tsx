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

/** Подпись у логотипа — над названием, наискосок. */
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
      Подпись у логотипа
    </span>
  ),
}

/**
 * Слоты `decor` и `cartDecor`: полоска под шапкой и значок на корзине. Простые
 * плейсхолдеры - настоящий декор рисует сайт. Оба не ловят клики.
 */
export const WithDecor = Template.bind({})
WithDecor.parameters = {
  layout: 'fullscreen',
}
WithDecor.args = {
  ...feedHeader(),
  decor: (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: -22,
        height: 33,
        pointerEvents: 'none',
        zIndex: 1,
        background:
          'repeating-linear-gradient(90deg, #d9534f 0 12px, #f0ad4e 12px 24px, #5cb85c 24px 36px)',
        opacity: 0.7,
      }}
    />
  ),
  cartDecor: (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: -8,
        left: -6,
        width: 24,
        height: 18,
        pointerEvents: 'none',
        background: '#d9534f',
        borderRadius: '12px 12px 0 0',
        transform: 'rotate(-14deg)',
      }}
    />
  ),
}

/** Telegram iOS (`isPinned: false`): гирлянда должна по-прежнему висеть под шапкой. */
export const WithDecorUnpinned = Template.bind({})
WithDecorUnpinned.parameters = {
  layout: 'fullscreen',
}
WithDecorUnpinned.args = {
  ...WithDecor.args,
  isPinned: false,
}
