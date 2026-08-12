import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { Select } from '.'
import { feedSelect } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Select',
  component: Select,
} satisfies Meta<typeof Select>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого
 * в Storybook в него нельзя было бы ничего выбрать.
 *
 * Ширина ограничена: поле тянется по контейнеру, а вместе с ним и список —
 * на всю ширину канваса он выглядит не тем, чем является.
 */
const Template: StoryFn<typeof Select> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <div style={{ width: 280 }}>
        <Select {...args} value={value} onChange={setValue} />
      </div>
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedSelect()

/** С выбранным значением: в списке оно помечено галочкой и марочной подложкой. */
export const Selected = Template.bind({})
Selected.parameters = {
  layout: 'centered',
}
Selected.args = { ...feedSelect(), value: 'makeup' }

/** Обязательное поле: заглушка остаётся в списке, но выбрать её нельзя. */
export const Required = Template.bind({})
Required.parameters = {
  layout: 'centered',
}
Required.args = {
  ...feedSelect(),
  required: true,
  hint: 'Категория нужна, чтобы товар попал в фильтр каталога.',
}

export const Invalid = Template.bind({})
Invalid.parameters = {
  layout: 'centered',
}
Invalid.args = { ...feedSelect(), error: 'Выберите категорию' }

export const Disabled = Template.bind({})
Disabled.parameters = {
  layout: 'centered',
}
Disabled.args = { ...feedSelect(), value: 'hair', disabled: true }

/** Длинный список: включается прокрутка внутри панели, высота упирается в потолок. */
export const LongList = Template.bind({})
LongList.parameters = {
  layout: 'centered',
}
LongList.args = {
  ...feedSelect(),
  options: Array.from({ length: 24 }, (_, index) => ({
    value: `category-${index}`,
    label: `Категория ${index + 1}`,
  })),
}

/**
 * Поле у нижнего края экрана: список обязан раскрыться вверх, иначе он
 * упирается в край окна и показывает две строки из двадцати.
 */
export const NearViewportEdge: StoryFn<typeof Select> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', minHeight: '90vh', paddingBottom: 8 }}
      >
        <div style={{ width: 280 }}>
          <Select {...args} value={value} onChange={setValue} />
        </div>
      </div>
    </StoryWrapper>
  )
}
NearViewportEdge.parameters = {
  layout: 'fullscreen',
}
NearViewportEdge.args = feedSelect()
