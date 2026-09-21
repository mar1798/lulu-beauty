import { useState } from 'react'
import type { StoryFn, Meta } from '@storybook/react'
import { ProductDetails, ProductDetailsSkeleton } from '.'
import { Button } from '../../atoms/button'
import { feedProductDetails, feedProductWithVariants } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ProductDetails',
  component: ProductDetails,
} satisfies Meta<typeof ProductDetails>

const Template: StoryFn<typeof ProductDetails> = args => (
  <StoryWrapper>
    <ProductDetails {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'padded',
}
Default.args = feedProductDetails()

/** Что видно на `/catalog/[slug]`, пока товар едет (`fallback: true`). */
export const Loading: StoryFn = () => (
  <StoryWrapper>
    <ProductDetailsSkeleton />
  </StoryWrapper>
)
Loading.parameters = {
  layout: 'padded',
}

/**
 * Товар в нескольких объёмах: переключатель, а цена и наличие читаются с
 * выбранного объёма, а не с товара.
 *
 * Выбор держит страница (`apps/website`), поэтому и в стори он живёт снаружи
 * виджета — иначе демонстрировался бы не тот контракт, что в бою.
 */
export const SeveralVolumes: StoryFn = () => {
  const product = feedProductWithVariants()
  const [selectedId, setSelectedId] = useState(product.variants[0].id)
  const selected = product.variants.find(variant => variant.id === selectedId)

  return (
    <StoryWrapper>
      <ProductDetails
        product={product}
        categoryName="Уход за кожей"
        selectedVariantId={selectedId}
        onSelectVariant={setSelectedId}
        action={
          <Button size="lg" disabled={selected?.inStock !== true}>
            В корзину
          </Button>
        }
      />
    </StoryWrapper>
  )
}
SeveralVolumes.parameters = {
  layout: 'padded',
}
