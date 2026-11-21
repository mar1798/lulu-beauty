import { describe, expect, it } from 'vitest'
import { CartPanel } from '.'
import { formatPrice } from '../../atoms/price'
import { feedCartPanel, feedCartPanelWithPromotions } from '../../stories/feed'
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

  describe('акции', () => {
    it('без акций итог - сумма корзины, строк скидок и подарков нет', () => {
      const { queryByText } = renderWidget(<CartPanel {...feedCartPanel()} />)

      expect(queryByText('Товары')).toBeNull()
      expect(queryByText('Бесплатно')).toBeNull()
    })

    it('подарок идёт строкой после позиций, с названием акции', () => {
      const { getByText } = renderWidget(<CartPanel {...feedCartPanelWithPromotions()} />)

      expect(getByText('Mystery box')).toBeTruthy()
      expect(getByText('Бесплатно')).toBeTruthy()
      expect(getByText('Акция «Весенняя распродажа»', { selector: 'p' })).toBeTruthy()
    })

    it('со скидкой показывает строку скидки и сумму к оплате с сервера', () => {
      const props = feedCartPanelWithPromotions()
      const payable = props.cart?.promotions.payableCents ?? 0
      const discount = props.cart?.promotions.discountCents ?? 0
      const { getByText } = renderWidget(<CartPanel {...props} />)
      // Разряды суммы разделены неразрывным пробелом, а `getByText` сворачивает его в обычный.
      const text = (prefix: string, cents: number): RegExp =>
        new RegExp(`^${prefix}${formatPrice(cents).replace(/\s/g, '\\s')}$`)

      expect(getByText('Товары')).toBeTruthy()
      expect(getByText(text('-', discount))).toBeTruthy()
      expect(getByText(text('', payable))).toBeTruthy()
    })

    it('подсказка «ещё N сом» ведёт на страницу акции', () => {
      const { getByRole } = renderWidget(<CartPanel {...feedCartPanelWithPromotions()} />)

      expect(getByRole('link', { name: '«Подарок за большую заявку»' }).getAttribute('href')).toBe(
        '/promotions/big-order'
      )
    })
  })
})
