import type { StoryFn, Meta } from '@storybook/react'
import { Tooltip } from '.'
import { Button } from '../button'
import { feedTooltip } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Tooltip',
  component: Tooltip,
} satisfies Meta<typeof Tooltip>

const Template: StoryFn<typeof Tooltip> = args => (
  <StoryWrapper>
    <Tooltip {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedTooltip()

/**
 * Основной случай: кнопка недоступна, и подсказка объясняет почему. Причина
 * продублирована в `unavailableReason` — пузырь скрыт от скринридера, доступное
 * имя даёт сама кнопка.
 */
export const OnUnavailableButton = Template.bind({})
OnUnavailableButton.parameters = {
  layout: 'centered',
}
OnUnavailableButton.args = {
  content: 'Сейчас нет открытого сбора',
  children: (
    <Button unavailableReason="Сейчас нет открытого сбора">В корзину</Button>
  ),
}

export const Bottom = Template.bind({})
Bottom.parameters = {
  layout: 'centered',
}
Bottom.args = { ...feedTooltip(), placement: 'bottom' }
