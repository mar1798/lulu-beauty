import { describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { OrderItemRow } from '.'
import { feedOrderItemRow } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('OrderItemRow', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<OrderItemRow {...feedOrderItemRow()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Адрес картинки в заявке — снапшот на момент оформления, и он переживает
    сам файл: владелец волен удалить фотографию вместе с товаром. Такая
    позиция обязана выглядеть как позиция без фото, а не как битая картинка.
  */
  it('заменяет не отдавшуюся картинку заглушкой', () => {
    const feed = feedOrderItemRow()
    const { container } = renderWidget(
      <OrderItemRow
        {...feed}
        item={{ ...feed.item, productImageUrl: 'https://example.test/gone.png' }}
      />
    )

    const image = container.querySelector('img')
    expect(image).not.toBeNull()

    fireEvent.error(image as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
