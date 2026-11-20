import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromotionRewardBuilder } from '.'
import { feedPromotionRewardBuilder } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionRewardBuilder', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromotionRewardBuilder {...feedPromotionRewardBuilder()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('у свободного подарка название по умолчанию — «Mystery box»', () => {
    renderWidget(<PromotionRewardBuilder {...feedPromotionRewardBuilder()} />)

    expect(screen.getByLabelText('Название подарка')).toHaveValue('Mystery box')
  })

  it('в наградах промокода нет типа «Промокод»', () => {
    renderWidget(
      <PromotionRewardBuilder {...feedPromotionRewardBuilder()} allowPromoCode={false} />
    )

    expect(screen.queryByRole('option', { name: 'Промокод' })).toBeNull()
  })

  it('строка-промокод отдаёт «Настроить» наверх с ключом строки', async () => {
    const onEditPromoCode = vi.fn()
    const props = feedPromotionRewardBuilder()
    const [first, second] = props.value

    renderWidget(
      <PromotionRewardBuilder
        {...props}
        value={[first, { ...second, type: 'PROMO_CODE', promoCode: null }]}
        onEditPromoCode={onEditPromoCode}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Настроить промокод' }))

    expect(onEditPromoCode).toHaveBeenCalledWith(second.key)
  })

  it('«Добавить награду» дописывает строку со скидкой', async () => {
    const onChange = vi.fn()

    renderWidget(<PromotionRewardBuilder {...feedPromotionRewardBuilder()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Добавить награду' }))

    const next = onChange.mock.calls[0][0]

    expect(next).toHaveLength(3)
    expect(next[2].type).toBe('DISCOUNT')
  })
})
