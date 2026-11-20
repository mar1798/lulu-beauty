import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromotionProductSearch } from '.'
import { feedProduct, feedPromotionProductSearch } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionProductSearch', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromotionProductSearch {...feedPromotionProductSearch()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('ищет по набранному слову и отдаёт выбранный вариант наверх', async () => {
    const onPick = vi.fn()
    const props = feedPromotionProductSearch()
    const searchProducts = vi.fn(props.searchProducts)

    renderWidget(
      <PromotionProductSearch {...props} searchProducts={searchProducts} onPick={onPick} />
    )
    await userEvent.type(screen.getByRole('searchbox'), 'крем')

    const add = await screen.findAllByRole('button', { name: /^Добавить: Сыворотка крем/ })

    await userEvent.click(add[0])

    expect(searchProducts).toHaveBeenCalledWith('крем')
    expect(onPick).toHaveBeenCalledOnce()
  })

  it('уже выбранный товар помечен «Выбран» и не выбирается повторно', async () => {
    const props = feedPromotionProductSearch()
    const picked = feedProduct({ id: 'picked', name: 'Сыворотка крем' })
    const other = feedProduct({ id: 'other', name: 'Тонер крем' })

    renderWidget(
      <PromotionProductSearch
        {...props}
        searchProducts={async () => [picked, other]}
        pickedProductIds={['picked']}
      />
    )
    await userEvent.type(screen.getByRole('searchbox'), 'крем')

    const selected = await screen.findAllByRole('button', { name: /^Выбран: Сыворотка крем/ })

    expect(selected[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /^Добавить: Тонер крем/ })[0]).not.toBeDisabled()
  })

  it('сбой поиска — сообщение, а не «ничего не нашлось»', async () => {
    const props = feedPromotionProductSearch()

    renderWidget(
      <PromotionProductSearch {...props} searchProducts={() => Promise.reject(new Error('сеть'))} />
    )
    await userEvent.type(screen.getByRole('searchbox'), 'крем')

    expect(await screen.findByText(/Не удалось выполнить поиск/)).toBeInTheDocument()
  })
})
