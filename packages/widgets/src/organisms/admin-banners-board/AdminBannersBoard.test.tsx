import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminBannersBoard } from '.'
import type { IAdminBannersBoardProps } from '../../types'
import { feedAdminBannersBoard } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

const setup = (
  overrides: Partial<IAdminBannersBoardProps> = {}
): {
  onToggleShown: ReturnType<typeof vi.fn>
  onReorder: ReturnType<typeof vi.fn>
  onDeleteNews: ReturnType<typeof vi.fn>
} => {
  const handlers = { onToggleShown: vi.fn(), onReorder: vi.fn(), onDeleteNews: vi.fn() }

  renderWidget(<AdminBannersBoard {...feedAdminBannersBoard()} {...handlers} {...overrides} />)

  return handlers
}

const rows = (): HTMLElement[] => screen.getAllByRole('listitem')

describe('AdminBannersBoard', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminBannersBoard {...feedAdminBannersBoard()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('подписывает состояния словами', () => {
    setup()

    expect(screen.getAllByText('В карусели')).toHaveLength(2)
    expect(screen.getByText('Скрыт')).toBeInTheDocument()
    expect(screen.getByText('Нет мобильного баннера')).toBeInTheDocument()
    expect(screen.getByText('Акция выключена')).toBeInTheDocument()
    expect(screen.getByText('Запланирована')).toBeInTheDocument()
  })

  it('завершённые по умолчанию скрыты, а выключатель их показывает; у новости - «Истекла»', async () => {
    setup()

    expect(screen.queryByText('Прошлый сбор закрыт')).toBeNull()
    expect(screen.getByText('Скрыто завершённых: 1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: 'Скрывать завершённые' }))

    expect(screen.getByText('Прошлый сбор закрыт')).toBeInTheDocument()
    expect(screen.getByText('Истекла')).toBeInTheDocument()
  })

  it('отличает акцию от новости и новость без картинки - плашкой «Текст»', () => {
    setup()

    expect(screen.getAllByText('Акция').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Новость').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Текст').length).toBeGreaterThan(0)
  })

  it('переключатель сообщает новый выбор и строку', async () => {
    const { onToggleShown } = setup()

    await userEvent.click(
      screen.getByRole('switch', { name: 'Показывать в карусели: Mystery box в подарок' })
    )

    expect(onToggleShown).toHaveBeenCalledTimes(1)
    expect(onToggleShown.mock.calls[0]?.[0]).toMatchObject({ key: 'promotion:promo-box' })
    expect(onToggleShown.mock.calls[0]?.[1]).toBe(true)
  })

  it('занятыми могут быть несколько строк сразу: заблокированы только они', () => {
    setup({ busyKeys: new Set(['promotion:promo-box', 'promotion:nonexistent']) })

    const busy = screen.getByRole('switch', {
      name: 'Показывать в карусели: Mystery box в подарок',
    })

    expect(busy).toBeDisabled()
    expect(
      screen
        .getAllByRole('switch', { name: /^Показывать в карусели/ })
        .some(s => !s.hasAttribute('disabled'))
    ).toBe(true)
  })

  it('«Выше» у первого и «Ниже» у последнего недоступны', () => {
    setup()

    const [first] = rows()
    const last = rows().at(-1)

    expect(within(first as HTMLElement).getByRole('button', { name: /^Выше/ })).toBeDisabled()
    expect(within(first as HTMLElement).getByRole('button', { name: /^Ниже/ })).toBeEnabled()
    expect(within(last as HTMLElement).getByRole('button', { name: /^Ниже/ })).toBeDisabled()
    expect(within(last as HTMLElement).getByRole('button', { name: /^Выше/ })).toBeEnabled()
  })

  it('«Ниже» меняет строку с соседней и отдаёт весь порядок ключей', async () => {
    const { onReorder } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Ниже: Новый сбор открыт' }))

    expect(onReorder).toHaveBeenCalledWith([
      'promotion:promo-spring',
      'news:news-cycle',
      'promotion:promo-box',
      'promotion:promo-plain',
      'promotion:promo-off',
      'news:news-old',
      'news:news-later',
    ])
  })

  it('перестановка обходит скрытые завершённые, не трогая их места', async () => {
    const { onReorder } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Ниже: Выключенная акция' }))

    // Соседняя видимая - «Скоро…»; завершённая остаётся на своём месте между ними.
    expect(onReorder).toHaveBeenCalledWith([
      'news:news-cycle',
      'promotion:promo-spring',
      'promotion:promo-box',
      'promotion:promo-plain',
      'news:news-later',
      'news:news-old',
      'promotion:promo-off',
    ])
  })

  it('пока порядок сохраняется, стрелки недоступны', () => {
    setup({ isReordering: true })

    expect(
      screen
        .getAllByRole('button', { name: /^Ниже/ })
        .every(button => button.hasAttribute('disabled'))
    ).toBe(true)
  })

  it('у новости есть «Изменить» и «Удалить», у акции - «Открыть акцию»', async () => {
    const { onDeleteNews } = setup()

    expect(screen.getByRole('link', { name: 'Изменить: Новый сбор открыт' })).toHaveAttribute(
      'href',
      '/admin/banners/news/news-cycle'
    )
    expect(
      screen.getByRole('link', { name: 'Открыть акцию: Весенняя распродажа' })
    ).toHaveAttribute('href', '/admin/promotions/promo-spring')
    expect(screen.queryByRole('button', { name: 'Удалить: Весенняя распродажа' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Удалить: Новый сбор открыт' }))

    expect(onDeleteNews).toHaveBeenCalledTimes(1)
  })

  it('пустой список показывает emptyState', () => {
    renderWidget(
      <AdminBannersBoard {...feedAdminBannersBoard()} items={[]} emptyState={<p>Пусто</p>} />
    )

    expect(screen.getByText('Пусто')).toBeInTheDocument()
  })
})
