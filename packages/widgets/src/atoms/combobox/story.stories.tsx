import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Combobox } from '.'
import { feedCombobox } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Combobox',
  component: Combobox,
} satisfies Meta<typeof Combobox>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в него нельзя было бы ничего набрать.
 *
 * Ширина ограничена: поле тянется по контейнеру, а вместе с ним и список.
 */
const Template: StoryFn<typeof Combobox> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <div style={{ width: 320 }}>
        <Combobox {...args} value={value} onChange={setValue} />
      </div>
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedCombobox()

/**
 * Набрано в другом регистре: подсказка всё равно находится и помечена как
 * совпавшая, а на выходе из поля значение приводится к её написанию.
 */
export const CaseInsensitiveMatch = Template.bind({})
CaseInsensitiveMatch.parameters = {
  layout: 'centered',
}
CaseInsensitiveMatch.args = { ...feedCombobox(), value: 'round lab' }

/** Значение вне списка: поле не мешает завести новый бренд. */
export const NewValue = Template.bind({})
NewValue.parameters = {
  layout: 'centered',
}
NewValue.args = { ...feedCombobox(), value: 'Beauty of Joseon' }

export const Invalid = Template.bind({})
Invalid.parameters = {
  layout: 'centered',
}
Invalid.args = { ...feedCombobox(), error: 'Укажите производителя' }

export const Disabled = Template.bind({})
Disabled.parameters = {
  layout: 'centered',
}
Disabled.args = { ...feedCombobox(), value: 'COSRX', disabled: true }

/** Подсказок ещё нет — поле работает как обычный `Input`. */
export const WithoutOptions = Template.bind({})
WithoutOptions.parameters = {
  layout: 'centered',
}
WithoutOptions.args = { ...feedCombobox(), options: [] }

/** Длинный список: включается прокрутка внутри панели, высота упирается в потолок. */
export const LongList = Template.bind({})
LongList.parameters = {
  layout: 'centered',
}
LongList.args = {
  ...feedCombobox(),
  options: Array.from({ length: 24 }, (_, index) => `Бренд ${index + 1}`),
}
