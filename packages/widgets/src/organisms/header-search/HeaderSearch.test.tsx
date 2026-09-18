import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeaderSearch } from '.'
import { feedHeaderSearch } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('HeaderSearch', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<HeaderSearch {...feedHeaderSearch()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('до фокуса списка в разметке нет', () => {
    renderWidget(<HeaderSearch {...feedHeaderSearch()} />)

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('по фокусу показывает группы и строки ссылками', async () => {
    const user = userEvent.setup()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} />)

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Категории')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Тонеры/ })).toHaveAttribute(
      'href',
      '/catalog?category=toners'
    )
  })

  it('Enter без выделенной строки отправляет запрос целиком', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onSelect = vi.fn()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} onSubmit={onSubmit} onSelect={onSelect} />)

    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('стрелка вниз выделяет первую строку, и Enter отдаёт её сайту', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onSelect = vi.fn()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} onSubmit={onSubmit} onSelect={onSelect} />)

    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-toners' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('пустой ответ — это «ничего не нашлось», а не отсутствие ответа', async () => {
    const user = userEvent.setup()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} groups={[]} allResults={undefined} />)

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByText(/ничего не нашлось/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/sululu_kg'
    )
  })

  it('«показать всё» при пустых группах не подменяет «ничего не нашлось»', async () => {
    const user = userEvent.setup()
    renderWidget(
      <HeaderSearch
        {...feedHeaderSearch()}
        groups={[]}
        allResults={{ label: 'Показать всё', link: { href: '/catalog?q=тон' } }}
      />
    )

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByText(/ничего не нашлось/i)).toBeInTheDocument()
  })

  it('пока подсказок не спрашивали, списка нет вовсе', async () => {
    const user = userEvent.setup()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} groups={null} />)

    await user.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('пока идёт запрос, список помечен как занятый', async () => {
    const user = userEvent.setup()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} isBusy={true} />)

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true')
  })

  it('поле не принимает больше, чем принимает ручка подсказок', () => {
    renderWidget(<HeaderSearch {...feedHeaderSearch()} />)

    expect(screen.getByRole('combobox')).toHaveAttribute('maxlength', '255')
  })

  it('лупа открывает панель — с полем и выдачей внутри', async () => {
    const user = userEvent.setup()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} />)

    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Найти товар' }))

    const panel = screen.getByRole('dialog', { name: 'Поиск' })
    // Поле — внутри панели, а не под шапкой: это и есть поиск на телефоне.
    expect(within(panel).getByRole('combobox')).toHaveFocus()
    expect(within(panel).getByRole('listbox')).toBeInTheDocument()
    expect(within(panel).getByText('Категории')).toBeInTheDocument()
  })

  it('выбранная строка закрывает панель', async () => {
    const user = userEvent.setup()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} />)

    await user.click(screen.getByRole('button', { name: 'Найти товар' }))
    await user.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Escape закрывает панель, не стирая набранное', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Найти товар' }))
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Escape закрывает список, не стирая набранное', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWidget(<HeaderSearch {...feedHeaderSearch()} onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Escape}')

    // Список уходит с анимацией (`AnimatePresence`), поэтому из разметки он
    // пропадает не в тот же тик, что состояние.
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
  })
})
