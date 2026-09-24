import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderDetails } from '.'
import { feedOrder, feedOrderDetails, feedOrderItem } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Ключевое здесь — когда карточка пускает к правке. Правило считает бэкенд
 * (`isEditable`), но одного флага мало: без обработчиков та же карточка
 * показывается в режиме чтения, и перепутать эти два условия легко.
 */
describe('OrderDetails', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<OrderDetails {...feedOrderDetails()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('без обработчиков не показывает управления даже у правимой заявки', () => {
    renderWidget(<OrderDetails {...feedOrderDetails()} order={feedOrder({ isEditable: true })} />)

    expect(screen.queryByRole('button', { name: /Убрать из заявки/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отменить заявку' })).not.toBeInTheDocument()
  })

  it('не пускает к правке заявку, которую бэкенд закрыл, но отменить даёт', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: false, pendingStage: 'PURCHASING' })}
        onItemQuantityChange={vi.fn()}
        onItemRemove={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /Убрать из заявки/ })).not.toBeInTheDocument()
    /*
      Ради этого флаги и разъехались: состав замирает вместе со списком закупки,
      а сама заявка — нет, против неподтверждённой ничего не куплено.
    */
    expect(screen.getByRole('button', { name: 'Отменить заявку' })).toBeInTheDocument()
  })

  it('у заявки, которую уже подтвердили, отмены нет', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({
          status: 'CONFIRMED',
          isEditable: false,
          isCancellable: false,
          pendingStage: null,
        })}
        onItemQuantityChange={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Отменить заявку' })).not.toBeInTheDocument()
  })

  /*
    Пустая карточка здесь и была жалобой: два одинаковых «Ожидает подтверждения»,
    под одним действия, под другим ничего — и ни слова почему.
  */
  it('ждущей заявке из закрытого сбора объясняет, чего она ждёт', () => {
    const { rerender } = renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: false, pendingStage: 'PURCHASING' })}
      />
    )
    expect(screen.getByText(/владелец закупает заявки/)).toBeInTheDocument()

    rerender(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: false, isCancellable: false, pendingStage: 'UNFULFILLED' })}
      />
    )
    expect(screen.getByText(/не вошла в закупку/)).toBeInTheDocument()
  })

  it('у заявки, мимо которой прошла закупка, отмены больше нет', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: false, isCancellable: false, pendingStage: 'UNFULFILLED' })}
        onCancel={vi.fn()}
      />
    )

    /*
      Кнопки нет, но экран не пустой: отменять то, что уже не состоится, нечего,
      а объяснение и адрес, куда написать, остаются на месте.
    */
    expect(screen.queryByRole('button', { name: 'Отменить заявку' })).not.toBeInTheDocument()
    expect(screen.getByText(/не вошла в закупку/)).toBeInTheDocument()
  })

  it('меняет количество и убирает позицию по идентификатору строки', async () => {
    const onItemQuantityChange = vi.fn()
    const onItemRemove = vi.fn()
    const user = userEvent.setup()
    const order = feedOrder({
      isEditable: true,
      items: [feedOrderItem({ quantity: 2 }), feedOrderItem()],
    })

    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={order}
        onItemQuantityChange={onItemQuantityChange}
        onItemRemove={onItemRemove}
      />
    )

    await user.click(screen.getAllByRole('button', { name: /Увеличить количество/ })[0])
    expect(onItemQuantityChange).toHaveBeenCalledWith(order.items[0].id, 3)

    await user.click(screen.getAllByRole('button', { name: /Убрать из заявки/ })[0])
    expect(onItemRemove).toHaveBeenCalledWith(order.items[0].id)
  })

  it('единственную позицию убрать не даёт - на это есть отмена заявки', () => {
    const order = feedOrder({ isEditable: true, items: [feedOrderItem()] })

    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={order}
        onItemQuantityChange={vi.fn()}
        onItemRemove={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(
      screen.getByRole('button', {
        name: 'Последнюю позицию убрать нельзя - отмените заявку целиком',
      })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отменить заявку' })).toBeEnabled()
  })

  it('слот добавления живёт по тем же двум условиям, что и правка', () => {
    const addItem = <div>Добавить товар</div>

    const { rerender } = renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: true })}
        onItemQuantityChange={vi.fn()}
        addItem={addItem}
      />
    )
    expect(screen.getByText('Добавить товар')).toBeInTheDocument()

    // Тот же слот у закрытой заявки: показывать его — обещать невыполнимое.
    rerender(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: false })}
        onItemQuantityChange={vi.fn()}
        addItem={addItem}
      />
    )
    expect(screen.queryByText('Добавить товар')).not.toBeInTheDocument()
  })

  it('зовёт возврат у отменённой заявки, пока сбор открыт', async () => {
    const onRestore = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({
          status: 'CANCELLED_BY_CUSTOMER',
          isEditable: false,
          isRestorable: true,
          isCancellable: false,
          pendingStage: null,
        })}
        onRestore={onRestore}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Вернуть заявку' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })

  it('после дедлайна возврата не предлагает - и не зовёт обсудить правку', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({
          status: 'CANCELLED_BY_CUSTOMER',
          isEditable: false,
          isRestorable: false,
          isCancellable: false,
          pendingStage: null,
        })}
        isCurrentCycle={true}
        onRestore={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Вернуть заявку' })).not.toBeInTheDocument()
    expect(screen.getByText(/Изменить её уже нельзя/)).toBeInTheDocument()
  })

  it('отменённой владельцем заявке даёт адрес, по которому об этом спросить', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({
          status: 'CANCELLED_BY_OWNER',
          isEditable: false,
          isRestorable: false,
          isCancellable: false,
          pendingStage: null,
        })}
        isCurrentCycle={true}
        onRestore={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Вернуть заявку' })).not.toBeInTheDocument()
    expect(screen.getByText(/Заявка отменена магазином/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Instagram магазина' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/sululu_kg'
    )
  })

  /* В закрытом сборе «напишите» — совет исправить то, чего уже не исправить. */
  it('о той же отмене в прошлом сборе молчит', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({
          status: 'CANCELLED_BY_OWNER',
          isEditable: false,
          isRestorable: false,
          isCancellable: false,
          pendingStage: null,
        })}
        isCurrentCycle={false}
        onRestore={vi.fn()}
      />
    )

    expect(screen.queryByText(/Заявка отменена магазином/)).not.toBeInTheDocument()
  })

  it('возвратимой заявке не говорит, что менять уже нечего', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({
          status: 'CANCELLED_BY_CUSTOMER',
          isEditable: false,
          isRestorable: true,
          isCancellable: false,
          pendingStage: null,
        })}
        isCurrentCycle={true}
        onRestore={vi.fn()}
      />
    )

    expect(screen.queryByText(/Изменить её уже нельзя/)).not.toBeInTheDocument()
    expect(screen.getByText(/можно вернуть тем же составом/)).toBeInTheDocument()
  })

  it('сохраняет комментарий обрезанным, а пустой отправляет как null', async () => {
    const onNoteSave = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: true, note: null })}
        onItemQuantityChange={vi.fn()}
        onNoteSave={onNoteSave}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Добавить комментарий' }))
    await user.type(screen.getByRole('textbox'), '  позвоните вечером  ')
    await user.click(screen.getByRole('button', { name: 'Сохранить комментарий' }))
    expect(onNoteSave).toHaveBeenCalledWith('позвоните вечером')

    await user.click(screen.getByRole('button', { name: 'Добавить комментарий' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить комментарий' }))
    expect(onNoteSave).toHaveBeenLastCalledWith(null)
  })
})
