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

  /*
    Запрос по одной позиции не повод гасить «Оформить»: количество меняется
    оптимистично, и на каждое нажатие `−`/`+` кнопка мигала бы disabled-видом.
  */
  it('не блокирует оформление, пока меняется количество одной позиции', () => {
    const props = feedCartPanel()
    const { getByRole } = renderWidget(
      <CartPanel {...props} isBusy={false} isItemBusy={() => true} />
    )

    expect(getByRole('button', { name: 'Оформить заявку' }).hasAttribute('disabled')).toBe(false)
  })

  it('блокирует оформление, пока меняется состав корзины целиком', () => {
    const { getByRole } = renderWidget(<CartPanel {...feedCartPanel()} isBusy={true} />)

    expect(getByRole('button', { name: 'Оформить заявку' }).hasAttribute('disabled')).toBe(true)
  })

  /*
    Та же причина, но про саму позицию: строку рисует общий `ItemRow`, который
    умеет гасить количество на время запроса, — корзине это гашение не нужно,
    и передавать его она не должна, иначе быстрые нажатия `−`/`+` пропадут.
  */
  it('не гасит количество, пока идёт запрос по позиции', () => {
    const { getAllByRole } = renderWidget(
      <CartPanel {...feedCartPanel()} isItemBusy={() => true} />
    )

    // «+», а не «−»: у позиции с количеством 1 уменьшение отключено по минимуму.
    const increase = getAllByRole('button', { name: /Увеличить количество/ })
    expect(increase.length).toBeGreaterThan(0)
    expect(increase.every(button => !button.hasAttribute('disabled'))).toBe(true)
  })

  it('без ошибки пустая корзина остаётся пустым состоянием', () => {
    const { getByText } = renderWidget(
      <CartPanel {...feedCartPanel()} cart={null} emptyState={<p>Пока пусто</p>} />
    )

    expect(getByText('Пока пусто')).toBeTruthy()
  })
})
