import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { RichTextEditor } from '.'
import { RichText } from '../../atoms/rich-text'
import { feedRichTextEditor } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/RichTextEditor',
  component: RichTextEditor,
} satisfies Meta<typeof RichTextEditor>

/**
 * Стори держит состояние сама: контрол управляемый, и без этого в Storybook
 * в него нельзя было бы ничего ввести. Под полем — тот же HTML через
 * `RichText`, как его увидит покупатель: расхождение между ними и есть то,
 * что стоит ловить глазами.
 */
const Template: StoryFn<typeof RichTextEditor> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <div style={{ display: 'grid', gap: 32, width: 'min(640px, 90vw)' }}>
        <RichTextEditor {...args} value={value} onChange={setValue} />
        <RichText html={value} />
      </div>
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedRichTextEditor()

export const Empty = Template.bind({})
Empty.parameters = {
  layout: 'centered',
}
Empty.args = { ...feedRichTextEditor(), value: '' }

export const WithError = Template.bind({})
WithError.parameters = {
  layout: 'centered',
}
WithError.args = { ...feedRichTextEditor(), error: 'Описание длиннее 2000 символов' }
