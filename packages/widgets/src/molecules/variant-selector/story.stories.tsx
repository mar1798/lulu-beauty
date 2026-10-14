import type { StoryFn, Meta } from '@storybook/react'
import { useState } from 'react'
import { VariantSelector } from '.'
import { feedProductWithShades, feedVariantSelector } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/VariantSelector',
  component: VariantSelector,
} satisfies Meta<typeof VariantSelector>

const Template: StoryFn<typeof VariantSelector> = args => (
  <StoryWrapper>
    <VariantSelector {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedVariantSelector()

/** Объём и тон — два ряда; выбор живёт в стори, как на странице товара. */
export const WithShades: StoryFn<typeof VariantSelector> = () => {
  const [variants] = useState(() => feedProductWithShades().variants)
  const [selectedId, setSelectedId] = useState<string | null>(variants[0]?.id ?? null)

  return (
    <StoryWrapper>
      <VariantSelector variants={variants} selectedId={selectedId} onSelect={setSelectedId} />
    </StoryWrapper>
  )
}
WithShades.parameters = {
  layout: 'centered',
}
