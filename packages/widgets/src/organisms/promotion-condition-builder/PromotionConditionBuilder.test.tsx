import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromotionConditionBuilder } from '.'
import { feedPromotionConditionBuilder } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionConditionBuilder', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(
      <PromotionConditionBuilder {...feedPromotionConditionBuilder()} />
    )

    expect(container.firstElementChild).not.toBeNull()
  })

  it('«Добавить условие» дописывает строку в конец', async () => {
    const onChange = vi.fn()

    renderWidget(
      <PromotionConditionBuilder {...feedPromotionConditionBuilder()} onChange={onChange} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Добавить условие' }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0][0]).toHaveLength(3)
  })

  it('удаляет именно ту строку, у которой нажали корзину', async () => {
    const onChange = vi.fn()
    const props = feedPromotionConditionBuilder()

    renderWidget(<PromotionConditionBuilder {...props} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить условие 1' }))

    expect(onChange.mock.calls[0][0].map((row: { key: string }) => row.key)).toEqual(['c-2'])
  })

  it('без условий говорит, что награда достанется любой заявке', () => {
    renderWidget(<PromotionConditionBuilder {...feedPromotionConditionBuilder()} value={[]} />)

    expect(screen.getByText(/любой заявке/)).toBeInTheDocument()
  })

  it('ошибка строки стоит у её поля', () => {
    const props = feedPromotionConditionBuilder()

    renderWidget(
      <PromotionConditionBuilder
        {...props}
        errors={{ 'c-1': 'Укажите сумму в сомах, больше нуля' }}
      />
    )

    expect(screen.getByText('Укажите сумму в сомах, больше нуля')).toBeInTheDocument()
  })

  it('не даёт добавить строк больше предела', () => {
    renderWidget(<PromotionConditionBuilder {...feedPromotionConditionBuilder()} maxRows={2} />)

    expect(screen.getByRole('button', { name: 'Добавить условие' })).toBeDisabled()
  })
})
