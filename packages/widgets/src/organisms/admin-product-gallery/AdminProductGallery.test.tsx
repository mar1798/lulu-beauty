import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IProductImage } from '../../types'
import { AdminProductGallery } from '.'
import { feedAdminProductGallery } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/** Группа галереи по заголовку — секция, которую он подписывает. */
const group = (title: string): HTMLElement => screen.getByRole('region', { name: title })

const openPhoto = async (number: number): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^Фото ${number}\\b`) }))

  return screen.getByRole('dialog')
}

const lastCall = (onChange: ReturnType<typeof vi.fn>): IProductImage[] =>
  onChange.mock.calls[onChange.mock.calls.length - 1][0] as IProductImage[]

describe('AdminProductGallery', () => {
  it('раскладывает фото по группам: общие, тона, несколько тонов, скрытые', () => {
    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} />)

    expect(within(group('Для всех тонов')).getAllByRole('listitem')).toHaveLength(2)
    expect(within(group('05 Rose')).getAllByRole('listitem')).toHaveLength(3)
    expect(within(group('Для нескольких тонов')).getAllByRole('listitem')).toHaveLength(1)
    expect(within(group('Скрытые')).getAllByRole('listitem')).toHaveLength(1)
    // В группе «01 Nude» только плитка «Добавить».
    expect(within(group('01 Nude')).getAllByRole('listitem')).toHaveLength(1)
    // Объём у фото тона, отмеченного только в 50 мл, — подписью.
    expect(within(group('05 Rose')).getByText('только 50 мл')).toBeInTheDocument()
  })

  it('называет группы и выбор в окне словом товара', async () => {
    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} shadeLabel="SCENT" />)

    expect(group('Для всех ароматов')).toBeInTheDocument()
    expect(group('Для нескольких ароматов')).toBeInTheDocument()

    const dialog = await openPhoto(1)
    expect(within(dialog).getByRole('button', { name: 'Все ароматы' })).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Только выбранные ароматы' })
    ).toBeInTheDocument()
  })

  it('узнаёт тон фото без учёта регистра, как сервер', () => {
    const feed = feedAdminProductGallery()
    const images = feed.images.map((image, index) =>
      index === 1 ? { ...image, shades: ['05 rose'] } : image
    )

    renderWidget(<AdminProductGallery {...feed} images={images} />)

    expect(within(group('05 Rose')).getAllByRole('listitem')).toHaveLength(3)
  })

  it('привязывает добавленное в группу фото к её тону', async () => {
    const onAdd = vi.fn()

    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} onAdd={onAdd} />)

    await userEvent.click(screen.getByRole('button', { name: 'Добавить в «01 Nude»' }))
    await userEvent.upload(screen.getByLabelText('Выбрать фото'), [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ])

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd.mock.calls[0][0]).toEqual([
      expect.objectContaining({ shades: ['01 Nude'], volumesMl: [], hidden: false }),
      expect.objectContaining({ shades: ['01 Nude'], volumesMl: [], hidden: false }),
    ])
  })

  it('не пропускает файл не того формата и говорит какой', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup({ applyAccept: false })

    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} onAdd={onAdd} />)

    await user.click(screen.getByRole('button', { name: 'Добавить в «Для всех тонов»' }))
    await user.upload(
      screen.getByLabelText('Выбрать фото'),
      new File(['x'], 'photo.heic', { type: 'image/heic' })
    )

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/photo\.heic - формат не JPEG, PNG или WebP/)).toBeInTheDocument()
  })

  it('прячет фото из окна, и оно уходит в «Скрытые»', async () => {
    const onChange = vi.fn()

    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} onChange={onChange} />)

    const dialog = await openPhoto(2)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Скрыть' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(lastCall(onChange)[1]).toMatchObject({ hidden: true, volumesMl: [], shades: [] })
  })

  it('возвращает скрытое фото всем тонам', async () => {
    const onChange = vi.fn()

    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} onChange={onChange} />)

    const dialog = await openPhoto(5)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Все тона' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(lastCall(onChange)[4]).toMatchObject({ hidden: false, volumesMl: [], shades: [] })
  })

  it('отмечает фото на нескольких тонах галочками', async () => {
    const onChange = vi.fn()

    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} onChange={onChange} />)

    const dialog = await openPhoto(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Только выбранные тона' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: '01 Nude' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: '12 Berry' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(lastCall(onChange)[0]).toMatchObject({ shades: ['01 Nude', '12 Berry'], hidden: false })
  })

  it('не сохраняет «только выбранные» без единой галочки', async () => {
    const onChange = vi.fn()

    renderWidget(<AdminProductGallery {...feedAdminProductGallery()} onChange={onChange} />)

    const dialog = await openPhoto(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Только выбранные тона' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Отметьте хотя бы один тон')).toBeInTheDocument()
  })

  it('сохраняет описание и делает фото главным', async () => {
    const onChange = vi.fn()
    const feed = feedAdminProductGallery()

    renderWidget(<AdminProductGallery {...feed} onChange={onChange} />)

    const dialog = await openPhoto(2)
    const alt = within(dialog).getByRole('textbox', { name: 'Описание (alt)' })
    await userEvent.clear(alt)
    await userEvent.type(alt, '  Помада 05 Rose  ')
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Главное фото' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    const saved = lastCall(onChange)
    expect(saved[0]).toMatchObject({
      id: feed.images[1].id,
      alt: 'Помада 05 Rose',
      isPrimary: true,
    })
    expect(saved[1]).toMatchObject({ id: feed.images[0].id, isPrimary: false, sortOrder: 1 })
  })

  it('двигает фото только среди фото своей группы', async () => {
    const onChange = vi.fn()
    const feed = feedAdminProductGallery()
    // Между двумя фото «05 Rose» — общее: стрелка меняет местами фото тона, а не их с ним.
    const [first, rose, roseLarge, several, hidden] = feed.images
    const images = [first, rose, { ...several, shades: [] }, roseLarge, several, hidden]

    renderWidget(<AdminProductGallery {...feed} images={images} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Сдвинуть фото 4 левее' }))

    expect(lastCall(onChange).map(image => image.id)).toEqual(
      [first, roseLarge, images[2], rose, several, hidden].map(image => image.id)
    )
  })

  it('показывает фото выбранного варианта в порядке страницы товара', async () => {
    const feed = feedAdminProductGallery()

    renderWidget(<AdminProductGallery {...feed} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Вариант' }))
    await userEvent.click(screen.getByRole('option', { name: '30 мл, 05 Rose' }))

    const strip = screen.getByRole('list', { name: 'Фото по порядку показа' })
    // Фото тона, отмеченное только в 50 мл, сюда не попадает; скрытое — никогда.
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2)
  })
})
