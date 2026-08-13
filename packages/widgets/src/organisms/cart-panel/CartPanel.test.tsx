import { describe, expect, it } from 'vitest'
import { CartPanel } from '.'
import { feedCartPanel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CartPanel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<CartPanel {...feedCartPanel()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Не загрузившаяся корзина приходит сюда такой же пустой, как настоящая
    пустая, — и без этой ветки выдавала бы себя за неё: человек видел бы
    «загляните в каталог» вместо причины и шёл собирать корзину заново.
  */
  it('вместо пустого состояния показывает причину, если корзина не загрузилась', () => {
    const { queryByText, getByText } = renderWidget(
      <CartPanel
        {...feedCartPanel()}
        cart={null}
        error="Нет связи с сервером."
        emptyState={<p>Пока пусто</p>}
      />
    )

    expect(getByText('Нет связи с сервером.')).toBeTruthy()
    expect(queryByText('Пока пусто')).toBeNull()
  })

  it('без ошибки пустая корзина остаётся пустым состоянием', () => {
    const { getByText } = renderWidget(
      <CartPanel {...feedCartPanel()} cart={null} emptyState={<p>Пока пусто</p>} />
    )

    expect(getByText('Пока пусто')).toBeTruthy()
  })
})
