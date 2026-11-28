import type { StoryFn, Meta } from '@storybook/react'
import { ProductCard } from '.'
import { IconButton } from '../../atoms/icon-button'
import { feedProductCard, feedProductWithVariants } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'
import { IconPlus } from '../../svg/icons'

export default {
  title: 'Molecules/ProductCard',
  component: ProductCard,
} satisfies Meta<typeof ProductCard>

/** Ширина колонки каталога: карточка тянется по контейнеру, и без ограничения фото раздувается на весь экран. */
const Template: StoryFn<typeof ProductCard> = args => (
  <StoryWrapper>
    <div style={{ maxWidth: 260 }}>
      <ProductCard {...args} />
    </div>
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductCard()

/** Боевой вид в каталоге: в строке с ценой стоит круглое действие «в корзину». */
export const WithAction = Template.bind({})
WithAction.parameters = {
  layout: 'padded',
}
WithAction.args = {
  ...feedProductCard(),
  action: <IconButton icon={<IconPlus />} label="В корзину" variant="primary" size="md" />,
}

export const OutOfStock = Template.bind({})
OutOfStock.parameters = {
  layout: 'padded',
}
OutOfStock.args = (() => {
  const card = feedProductCard()

  return { ...card, product: { ...card.product, inStock: false } }
})()

/**
 * Товар продаётся в нескольких объёмах: в сетке выбирать негде, поэтому карточка
 * говорит «от» и перечисляет объёмы меткой — а выбор происходит на странице товара.
 */
export const SeveralVolumes = Template.bind({})
SeveralVolumes.parameters = {
  layout: 'padded',
}
SeveralVolumes.args = {
  ...feedProductCard(),
  product: feedProductWithVariants(),
  action: <IconButton icon={<IconPlus />} label="Выбрать объём" variant="primary" size="md" />,
}

/** Слот `decor`: плейсхолдер вместо шапочки - висит на углу карточки, вне `media`, клики не ловит. */
export const WithDecor = Template.bind({})
WithDecor.parameters = {
  layout: 'padded',
}
WithDecor.args = {
  ...feedProductCard(),
  action: <IconButton icon={<IconPlus />} label="В корзину" variant="primary" size="md" />,
  decor: (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: -24,
        left: -14,
        width: 52,
        height: 40,
        borderRadius: '50% 50% 8px 8px',
        background: '#d9534f',
        transform: 'rotate(-14deg)',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  ),
}
