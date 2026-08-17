import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminCategoriesPanel } from '.'
import { feedAdminCategoriesPanel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AdminCategoriesPanel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminCategoriesPanel {...feedAdminCategoriesPanel()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('поиск оставляет в списке только совпавшие категории', async () => {
    const props = feedAdminCategoriesPanel()
    const [first, second] = props.categories

    renderWidget(<AdminCategoriesPanel {...props} />)
    await userEvent.type(screen.getByRole('searchbox'), first?.slug ?? '')

    expect(screen.getByText(first?.name ?? '')).toBeTruthy()
    expect(screen.queryByText(second?.name ?? '')).toBeNull()
  })

  /* «Категорий нет» и «по запросу ничего» — разные новости и разные действия. */
  it('пустой результат поиска не выдаёт себя за пустой каталог категорий', async () => {
    renderWidget(<AdminCategoriesPanel {...feedAdminCategoriesPanel()} />)
    await userEvent.type(screen.getByRole('searchbox'), 'ничего-такого-нет')

    expect(screen.getByText(/ничего не нашлось/)).toBeTruthy()
    expect(screen.queryByText(/Категорий пока нет/)).toBeNull()
  })

  /*
    Раньше негодный слаг только гасил кнопку «Добавить», и в форме из двух полей
    было не видно, какое из них не нравится.
  */
  it('называет негодный слаг вместо молчаливой блокировки кнопки', async () => {
    const onCreate = vi.fn()

    renderWidget(<AdminCategoriesPanel {...feedAdminCategoriesPanel()} onCreate={onCreate} />)

    const names = screen.getAllByLabelText('Название')
    const slugs = screen.getAllByLabelText('Адрес (slug)')
    await userEvent.type(names[names.length - 1], 'Тонеры')
    await userEvent.clear(slugs[slugs.length - 1])
    await userEvent.type(slugs[slugs.length - 1], 'Tonery!')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByText('Только латиница, цифры и дефис: например, tonery.')).toBeTruthy()
  })

  /* Название транслитерируется в слаг само — русское имя не повод для ошибки. */
  it('заводит категорию по одному только названию', async () => {
    const onCreate = vi.fn()

    renderWidget(<AdminCategoriesPanel {...feedAdminCategoriesPanel()} onCreate={onCreate} />)

    const names = screen.getAllByLabelText('Название')
    await userEvent.type(names[names.length - 1], 'Тонеры')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(onCreate).toHaveBeenCalledWith({ name: 'Тонеры', slug: 'tonery' })
  })
})
