import { describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { ItemRow } from '.'
import { feedItemRow } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('ItemRow', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ItemRow {...feedItemRow()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Метки читаются из живого каталога, поэтому у позиции удалённого товара их нет —
    строка обязана остаться целой, а не потерять раскладку вместе с ними.
  */
  it('рисует метки товара', () => {
    const feed = feedItemRow()
    const withTags = renderWidget(
      <ItemRow
        {...feed}
        item={{
          ...feed.item,
          productBrand: 'Round lab',
          productCategoryName: 'Тонеры',
          productVolumeMl: 500,
        }}
      />
    )

    expect(withTags.getByText('Round lab')).toBeTruthy()
    expect(withTags.getByText('Тонеры')).toBeTruthy()
    expect(withTags.getByText('500 мл')).toBeTruthy()
  })

  it('обходится без меток, когда товара в каталоге больше нет', () => {
    const feed = feedItemRow()
    const withoutTags = renderWidget(
      <ItemRow
        {...feed}
        item={{
          ...feed.item,
          productBrand: null,
          productCategoryName: null,
          productVolumeMl: null,
        }}
      />
    )

    expect(withoutTags.queryByText('Round lab')).toBeNull()
    expect(withoutTags.getByText(feed.item.productName)).toBeTruthy()
  })

  /*
    Адрес картинки в заявке — снапшот на момент оформления, и он переживает
    сам файл: владелец волен удалить фотографию вместе с товаром. Такая
    позиция обязана выглядеть как позиция без фото, а не как битая картинка.
  */
  it('заменяет не отдавшуюся картинку заглушкой', () => {
    const feed = feedItemRow()
    const { container } = renderWidget(
      <ItemRow
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

  /*
    Строка одна на корзину и заявку, поэтому «убрать» откуда — знает вызывающий:
    в корзине это не «убрать из заявки», и наоборот.
  */
  it('берёт подпись кнопки удаления у вызывающего', () => {
    const feed = feedItemRow()
    const { getByRole } = renderWidget(
      <ItemRow
        {...feed}
        onQuantityChange={() => undefined}
        onRemove={() => undefined}
        removeLabel="Убрать из корзины: тонер"
      />
    )

    expect(getByRole('button', { name: 'Убрать из корзины: тонер' })).toBeTruthy()
  })

  /*
    Последнюю позицию заявки бэкенд убрать не даст — кнопка остаётся видимой,
    но объясняет собой, что делать вместо этого.
  */
  it('на заблокированном «убрать» показывает подсказку, а не подпись действия', () => {
    const feed = feedItemRow()
    const { getByRole } = renderWidget(
      <ItemRow
        {...feed}
        onQuantityChange={() => undefined}
        onRemove={() => undefined}
        canRemove={false}
        removeLabel="Убрать из заявки: тонер"
        removeBlockedLabel="Последнюю позицию убрать нельзя"
      />
    )

    const button = getByRole('button', { name: 'Последнюю позицию убрать нельзя' })
    expect(button.hasAttribute('disabled')).toBe(true)
  })
})
