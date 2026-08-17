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
    renderWidget(
      <OrderDetails {...feedOrderDetails()} order={feedOrder({ isEditable: true })} />
    )

    expect(screen.queryByRole('button', { name: /Убрать из заявки/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отменить заявку' })).not.toBeInTheDocument()
  })

  it('не пускает к правке заявку, которую бэкенд закрыл', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ isEditable: false })}
        onItemQuantityChange={vi.fn()}
        onItemRemove={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /Убрать из заявки/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отменить заявку' })).not.toBeInTheDocument()
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

  it('единственную позицию убрать не даёт — на это есть отмена заявки', () => {
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
        name: 'Последнюю позицию убрать нельзя — отмените заявку целиком',
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
        order={feedOrder({ status: 'CANCELLED_BY_CUSTOMER', isEditable: false, isRestorable: true })}
        onRestore={onRestore}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Вернуть заявку' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })

  it('после дедлайна возврата не предлагает — и не зовёт обсудить правку', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ status: 'CANCELLED_BY_CUSTOMER', isEditable: false, isRestorable: false })}
        isCurrentCycle={true}
        onRestore={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Вернуть заявку' })).not.toBeInTheDocument()
    expect(screen.getByText(/Изменить её уже нельзя/)).toBeInTheDocument()
  })

  it('возвратимой заявке не говорит, что менять уже нечего', () => {
    renderWidget(
      <OrderDetails
        {...feedOrderDetails()}
        order={feedOrder({ status: 'CANCELLED_BY_CUSTOMER', isEditable: false, isRestorable: true })}
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
