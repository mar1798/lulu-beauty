import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CheckoutPanel } from '.'
import { feedCheckoutPanel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CheckoutPanel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(
      <CheckoutPanel {...feedCheckoutPanel()} form={<p>Форма</p>} />
    )

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Главное, ради чего компонент и появился: до него на оформлении не было
    видно, что именно уходит владельцу.
  */
  it('показывает позиции корзины с количеством и суммой', () => {
    const props = feedCheckoutPanel()
    const first = props.cart?.items[0]
    const { getByText } = renderWidget(<CheckoutPanel {...props} form={<p>Форма</p>} />)

    expect(first).toBeDefined()
    expect(getByText(first?.productName ?? '')).toBeTruthy()
    expect(getByText(`${first?.quantity ?? 0} шт ×`)).toBeTruthy()
  })

  /*
    Дозаказ показывается только над готовым составом: под скелетонами добавлять
    некуда — непонятно, что уже лежит в корзине.
  */
  it('не показывает дозаказ, пока корзина грузится', () => {
    const { queryByText } = renderWidget(
      <CheckoutPanel
        {...feedCheckoutPanel()}
        cart={null}
        isLoading={true}
        addItem={<p>Подборщик</p>}
        form={<p>Форма</p>}
      />
    )

    expect(queryByText('Подборщик')).toBeNull()
  })

  it('показывает дозаказ под составом', () => {
    const { getByText } = renderWidget(
      <CheckoutPanel {...feedCheckoutPanel()} addItem={<p>Подборщик</p>} form={<p>Форма</p>} />
    )

    expect(getByText('Подборщик')).toBeTruthy()
  })

  it('состав правится в корзине - ссылка ведёт туда', () => {
    const { getByText } = renderWidget(
      <CheckoutPanel {...feedCheckoutPanel()} form={<p>Форма</p>} />
    )

    expect(getByText('Изменить в корзине').getAttribute('href')).toBe('/cart')
  })

  /*
    Количество правится на месте, удаление — нет: крестик в сантиметре от
    «Отправить заявку» уносил бы позицию без возможности отменить.
  */
  it('со степпером меняет количество позиции, но не даёт её убрать', () => {
    const props = feedCheckoutPanel()
    const first = props.cart?.items[0]
    const onQuantityChange = vi.fn()
    const { getAllByRole, queryByLabelText } = renderWidget(
      <CheckoutPanel {...props} form={<p>Форма</p>} onQuantityChange={onQuantityChange} />
    )

    expect(first).toBeDefined()
    expect(queryByLabelText(`Убрать: ${first?.productName ?? ''}`)).toBeNull()

    // «+», а не «−»: у позиции с количеством 1 уменьшение отключено по минимуму.
    const increase = getAllByRole('button', { name: /Увеличить количество/ })
    fireEvent.click(increase[0] as HTMLButtonElement)

    expect(onQuantityChange).toHaveBeenCalledWith(first?.variantId, (first?.quantity ?? 0) + 1)
  })

  /*
    Под отправкой состав уже уходит на сервер: нажатие `+` попало бы в корзину,
    которую заявка не заберёт.
  */
  it('замирает степпер на время отправки', () => {
    const { getAllByRole } = renderWidget(
      <CheckoutPanel
        {...feedCheckoutPanel()}
        form={<p>Форма</p>}
        onQuantityChange={vi.fn()}
        isBusy={true}
      />
    )

    const increase = getAllByRole('button', { name: /Увеличить количество/ })
    expect(increase.length).toBeGreaterThan(0)
    expect(increase.every(button => button.hasAttribute('disabled'))).toBe(true)
  })

  it('без обработчика состав только читается', () => {
    const { queryAllByRole } = renderWidget(
      <CheckoutPanel {...feedCheckoutPanel()} form={<p>Форма</p>} />
    )

    expect(queryAllByRole('button', { name: /Увеличить количество/ }).length).toBe(0)
  })
})
