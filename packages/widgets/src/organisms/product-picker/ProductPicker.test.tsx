import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductPicker } from '.'
import { feedProduct, feedProductPicker } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Проверяется разведение трёх похожих состояний («не искали», «ищем», «не
 * нашлось») и то, что наружу уходит идентификатор товара: по нему бэкенд
 * снимает снапшот, а слаг и цена в этот момент могут быть уже другими.
 */
describe('ProductPicker', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ProductPicker {...feedProductPicker()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('на пустом запросе показывает подсказку, а не «ничего не нашлось»', () => {
    renderWidget(<ProductPicker {...feedProductPicker()} query="" products={null} />)

    expect(screen.getByText(/Товар добавится в эту заявку/)).toBeInTheDocument()
    expect(screen.queryByText(/Ничего не нашлось/)).not.toBeInTheDocument()
  })

  it('пустой ответ на непустой запрос — это «ничего не нашлось»', () => {
    renderWidget(<ProductPicker {...feedProductPicker()} products={[]} />)

    expect(screen.getByText(/Ничего не нашлось/)).toBeInTheDocument()
  })

  it('отдаёт наружу идентификатор товара', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    const product = feedProduct({ name: 'Сыворотка с ниацинамидом' })

    renderWidget(<ProductPicker {...feedProductPicker()} products={[product]} onAdd={onAdd} />)

    /*
      Кнопок две: круглая для узкого экрана и со словом для широкого (одна из
      них всегда скрыта медиазапросом, а в jsdom стилей нет). Нажимаем первую —
      обе делают одно и то же.
    */
    const [add] = screen.getAllByRole('button', { name: 'Добавить: Сыворотка с ниацинамидом' })

    await user.click(add)

    expect(onAdd).toHaveBeenCalledWith(product.id)
  })

  it('товар из заявки не прячет, но говорит, что добавление сольётся с его строкой', () => {
    const product = feedProduct({ name: 'Крем для рук' })

    renderWidget(
      <ProductPicker
        {...feedProductPicker()}
        products={[product]}
        addedProductIds={[product.id]}
      />
    )

    expect(screen.getByText('Уже в заявке')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: 'Ещё одну: Крем для рук' })) {
      expect(button).toBeEnabled()
    }
  })

  it('товар не в наличии показывает, но добавить не даёт', () => {
    const product = feedProduct({ name: 'Тушь', inStock: false })

    renderWidget(<ProductPicker {...feedProductPicker()} products={[product]} />)

    expect(screen.getByText('Тушь')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Нет в наличии' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Нет в наличии: Тушь' })).toBeDisabled()
  })
})
