import { useState } from 'react'
import type { StoryFn, Meta } from '@storybook/react'
import { AdminChecklist } from '.'
import { feedAdminChecklist } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/AdminChecklist',
  component: AdminChecklist,
} satisfies Meta<typeof AdminChecklist>

/** Отметки и тумблер «Скрыть купленное» живут в стори, чтобы строки красились по нажатию, как на странице. */
const Template: StoryFn<typeof AdminChecklist> = args => {
  const [checkedKeys, setCheckedKeys] = useState(args.checkedKeys)
  const [hideChecked, setHideChecked] = useState(args.hideChecked ?? false)

  return (
    <StoryWrapper>
      <AdminChecklist
        {...args}
        checkedKeys={checkedKeys}
        hideChecked={hideChecked}
        onHideCheckedChange={setHideChecked}
        onToggle={(key, checked) => {
          setCheckedKeys(current =>
            checked ? [...current, key] : current.filter(existing => existing !== key)
          )
        }}
      />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.args = feedAdminChecklist()

export const Loading = Template.bind({})
Loading.args = { ...feedAdminChecklist(), items: [], isLoading: true }
