import type { StoryFn, Meta } from '@storybook/react'
import { TelegramLoginPanel } from '.'
import { feedTelegramLoginPanel } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/TelegramLoginPanel',
  component: TelegramLoginPanel,
} satisfies Meta<typeof TelegramLoginPanel>

const Template: StoryFn<typeof TelegramLoginPanel> = args => (
  <StoryWrapper>
    <TelegramLoginPanel {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.args = feedTelegramLoginPanel()

/** Ссылка ещё запрашивается: кнопка на месте, но нажимать пока некуда. */
export const Preparing = Template.bind({})
Preparing.args = { ...feedTelegramLoginPanel(), botUrl: null, status: 'preparing' }

export const Waiting = Template.bind({})
Waiting.args = { ...feedTelegramLoginPanel(), status: 'waiting' }

/**
 * С Telegram Login Widget — быстрой дорожкой для тех, кто уже привязывал бота.
 *
 * В Storybook вместо него заглушка: настоящую кнопку рисует скрипт с telegram.org и
 * только на домене, прописанном боту в BotFather. Здесь важно другое — что она стоит
 * **под** основной кнопкой и не вытесняет инструкцию для тех, у кого аккаунта ещё нет.
 */
export const WithLoginWidget = Template.bind({})
WithLoginWidget.args = {
  ...feedTelegramLoginPanel(),
  loginWidget: (
    <div
      style={{
        width: 186,
        height: 40,
        borderRadius: 12,
        background: '#54a9eb',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        font: '14px/1 sans-serif',
      }}
    >
      Log in with Telegram
    </div>
  ),
}

export const Expired = Template.bind({})
Expired.args = { ...feedTelegramLoginPanel(), status: 'expired' }

export const Failed = Template.bind({})
Failed.args = {
  ...feedTelegramLoginPanel(),
  status: 'error',
  error: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
}
