import { useState } from 'react'
import type { StoryFn, Meta } from '@storybook/react'
import { ProductDetails, ProductDetailsSkeleton } from '.'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
import { QuantityStepper } from '../../molecules/quantity-stepper'
import { IconCart, IconHeart } from '../../svg/icons'
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

/**
 * Строка действий так, как её собирает `apps/website`, — и переход между её
 * двумя видами, ради которого она и устроена так.
 *
 * Нажатие на «В корзину» ужимает кнопку в круг со знаком корзины и выпускает
 * количество на освободившееся место; шаг вниз с единицы убирает позицию, и
 * строка разворачивается обратно. В бою оба состояния приходят из корзины
 * (`isInCart`), здесь — из локального `useState`: виджету всё равно, откуда
 * ему сказали.
 *
 * Проверять нужно на узкой ширине: там круг, количество и сердце помещаются
 * в строку впритык.
 */
export const Actions: StoryFn = () => {
  const [quantity, setQuantity] = useState(0)

  return (
    <StoryWrapper>
      <ProductDetails
        {...feedProductDetails()}
        isInCart={quantity > 0}
        quantity={
          <QuantityStepper
            value={Math.max(quantity, 1)}
            min={0}
            onChange={setQuantity}
            decreaseLabel={quantity === 1 ? 'Убрать из корзины' : 'Уменьшить количество'}
          />
        }
        action={
          quantity > 0 ? (
            <IconButton icon={<IconCart />} label="В корзине" variant="solid" size="lg" />
          ) : (
            <Button size="lg" isFullWidth={true} onClick={() => setQuantity(1)}>
              В корзину
            </Button>
          )
        }
        secondaryAction={
          <IconButton icon={<IconHeart />} label="Добавить в избранное" variant="solid" size="lg" />
        }
      />
    </StoryWrapper>
  )
}

Actions.parameters = {
  layout: 'padded',
}

/**
 * Та же строка, но страницу открыли с товаром, который уже лежит в корзине, —
 * обычное дело для вернувшегося покупателя.
 *
 * Отдельная стори не ради полноты: развёрнутой кнопки виджет в этом случае
 * ещё не видел, и ширину, в которую разворачиваться, ему взять неоткуда.
 * Проверять надо именно здесь — первым же нажатием на `−`.
 */
export const ActionsInCart: StoryFn = () => {
  const [quantity, setQuantity] = useState(1)

  return (
    <StoryWrapper>
      <ProductDetails
        {...feedProductDetails()}
        isInCart={quantity > 0}
        quantity={
          <QuantityStepper
            value={Math.max(quantity, 1)}
            min={0}
            onChange={setQuantity}
            decreaseLabel={quantity === 1 ? 'Убрать из корзины' : 'Уменьшить количество'}
          />
        }
        action={
          quantity > 0 ? (
            <IconButton icon={<IconCart />} label="В корзине" variant="solid" size="lg" />
          ) : (
            <Button size="lg" isFullWidth={true} onClick={() => setQuantity(1)}>
              В корзину
            </Button>
          )
        }
        secondaryAction={
          <IconButton icon={<IconHeart />} label="Добавить в избранное" variant="solid" size="lg" />
        }
      />
    </StoryWrapper>
  )
}
ActionsInCart.parameters = {
  layout: 'padded',
}
