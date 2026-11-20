import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromotionTargetField } from '.'
import { feedPromotionTargetField } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionTargetField', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromotionTargetField {...feedPromotionTargetField()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('называет выбранный товар по подписи из каталога', () => {
    renderWidget(<PromotionTargetField {...feedPromotionTargetField()} />)

    expect(screen.getByText('Сыворотка Centella')).toBeInTheDocument()
  })

  it('товар с неизвестным названием подписан «Товар удалён»', () => {
    const props = feedPromotionTargetField()

    renderWidget(
      <PromotionTargetField {...props} value={{ ...props.value, productIds: ['gone'] }} />
    )

    expect(screen.getByText('Товар удалён')).toBeInTheDocument()
  })

  it('убирает бренд из списка', async () => {
    const onChange = vi.fn()
    const props = feedPromotionTargetField()

    renderWidget(<PromotionTargetField {...props} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Убрать: Anua' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ brands: [] }))
  })

  it('объясняет, что списки складываются через «любой»', () => {
    renderWidget(<PromotionTargetField {...feedPromotionTargetField()} />)

    expect(screen.getByText(/любой из списков/)).toBeInTheDocument()
  })
})
