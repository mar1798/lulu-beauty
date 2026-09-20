import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { OrderCard } from '.'
import { feedOrder, feedOrderCard } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('OrderCard', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<OrderCard {...feedOrderCard()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Именно в списке одинаковый бейдж и путал: приписка — единственное, что
    отличает заявку из идущего сбора от заявки, до которой так и не дошли.
  */
  it('под ждущей заявкой говорит, на какой она стадии', () => {
    const { rerender } = renderWidget(
      <OrderCard {...feedOrderCard()} order={feedOrder({ pendingStage: 'COLLECTING' })} />
    )
    expect(screen.getByText('Сбор открыт — состав ещё можно менять')).toBeInTheDocument()

    rerender(<OrderCard {...feedOrderCard()} order={feedOrder({ pendingStage: 'UNFULFILLED' })} />)
    expect(screen.getByText('Заявка не вошла в закупку')).toBeInTheDocument()
  })

  it('у заявки не в ожидании приписки нет — статус уже всё сказал', () => {
    renderWidget(
      <OrderCard
        {...feedOrderCard()}
        order={feedOrder({ status: 'COMPLETED', pendingStage: null })}
      />
    )

    expect(screen.queryByText(/Сбор/)).not.toBeInTheDocument()
  })
})
