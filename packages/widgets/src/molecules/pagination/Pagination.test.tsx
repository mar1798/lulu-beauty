import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PAGE_GAP, Pagination, pageCountOf, pageItems } from '.'
import { renderWidget } from '../../testing/render'

/**
 * Пагинация считает страницы из `total`/`pageSize` конверта `IPage<T>`,
 * поэтому ошибка в округлении сразу отрезает последнюю страницу каталога.
 */
describe('pageCountOf', () => {
  it('округляет вверх — хвост тоже страница', () => {
    expect(pageCountOf(147, 20)).toBe(8)
    expect(pageCountOf(20, 20)).toBe(1)
    expect(pageCountOf(21, 20)).toBe(2)
  })

  it('не падает на пустом каталоге и нулевом размере страницы', () => {
    expect(pageCountOf(0, 20)).toBe(0)
    expect(pageCountOf(10, 0)).toBe(0)
  })
})

describe('pageItems', () => {
  it('не показывает пагинацию, когда страница одна', () => {
    expect(pageItems(1, 1)).toEqual([])
    expect(pageItems(1, 0)).toEqual([])
  })

  it('показывает все номера, пока их мало', () => {
    expect(pageItems(2, 4)).toEqual([1, 2, 3, 4])
  })

  it('прячет середину за многоточием', () => {
    expect(pageItems(5, 10)).toEqual([1, PAGE_GAP, 4, 5, 6, PAGE_GAP, 10])
  })

  it('не ставит многоточие вплотную к краю', () => {
    expect(pageItems(1, 10)).toEqual([1, 2, PAGE_GAP, 10])
    expect(pageItems(10, 10)).toEqual([1, PAGE_GAP, 9, 10])
  })
})

describe('Pagination', () => {
  it('ничего не рендерит на единственной странице', () => {
    const { container } = renderWidget(
      <Pagination page={1} pageSize={20} total={12} onChange={vi.fn()} />
    )

    expect(container.firstElementChild).toBeNull()
  })

  it('помечает текущую страницу для скринридера', () => {
    renderWidget(<Pagination page={3} pageSize={20} total={147} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Страница 3')).toHaveAttribute('aria-current', 'page')
  })

  it('сообщает выбранную страницу', async () => {
    const onChange = vi.fn()

    renderWidget(<Pagination page={3} pageSize={20} total={147} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Страница 4'))

    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('гасит стрелки на краях', () => {
    renderWidget(<Pagination page={1} pageSize={20} total={147} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Предыдущая страница')).toBeDisabled()
    expect(screen.getByLabelText('Следующая страница')).toBeEnabled()
  })
})
