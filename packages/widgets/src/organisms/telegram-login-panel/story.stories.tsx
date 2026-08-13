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

export const Expired = Template.bind({})
Expired.args = { ...feedTelegramLoginPanel(), status: 'expired' }

export const Failed = Template.bind({})
Failed.args = {
  ...feedTelegramLoginPanel(),
  status: 'error',
  error: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
}
