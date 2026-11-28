import type { StoryFn, Meta } from '@storybook/react'
import { ProductGrid } from '.'
import { feedProductGrid } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ProductGrid',
  component: ProductGrid,
} satisfies Meta<typeof ProductGrid>

const Template: StoryFn<typeof ProductGrid> = args => (
  <StoryWrapper>
    <ProductGrid {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductGrid()

/** Ждём новую выдачу: прошлые карточки на месте, но приглушены. */
export const Busy = Template.bind({})
Busy.args = { ...feedProductGrid(), isBusy: true }

/**
 * `renderCardDecor` и `indexOffset`: плейсхолдер на каждой пятой карточке по
 * сквозному номеру (со второй страницы выдачи по 24 карточки номер начинается с 24).
 * Отступы между рядами увеличены, как в сезон: украшение висит над карточкой.
 */
export const WithCardDecor = Template.bind({})
WithCardDecor.parameters = {
  layout: 'padded',
}
WithCardDecor.args = {
  ...feedProductGrid(),
  indexOffset: 24,
  className: 'story-decor-grid',
  renderCardDecor: (_product, index) =>
    index % 5 === 0 ? (
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -20,
          left: -10,
          width: 48,
          height: 36,
          borderRadius: '50% 50% 8px 8px',
          background: '#d9534f',
          transform: 'rotate(-14deg)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    ) : null,
}
WithCardDecor.decorators = [
  Story => (
    <>
      <style>{'.story-decor-grid { row-gap: 32px !important; }'}</style>
      <Story />
    </>
  ),
]
