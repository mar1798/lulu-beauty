import type { StoryFn, Meta } from '@storybook/react'
import { ProductCard } from '.'
import { IconButton } from '../../atoms/icon-button'
import { feedProductCard } from '../../stories/feed'
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
