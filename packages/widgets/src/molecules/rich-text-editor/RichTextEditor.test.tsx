import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RichTextEditor } from '.'
import { feedRichTextEditor } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('RichTextEditor', () => {
  it('рендерится с фикстурой из feed', async () => {
    renderWidget(<RichTextEditor {...feedRichTextEditor()} />)

    const field = await screen.findByRole('textbox', { name: 'Описание' })
    expect(field.querySelector('h2')?.textContent).toBe('Как применять')
    expect(field.querySelectorAll('ol li')).toHaveLength(3)
  })

  it('не показывает кнопок, которых нет в разрешённом наборе', async () => {
    renderWidget(<RichTextEditor {...feedRichTextEditor()} />)

    const toolbar = await screen.findByRole('toolbar')
    const labels = [...toolbar.querySelectorAll('button')].map(button =>
      button.getAttribute('aria-label')
    )
    expect(labels).toEqual([
      'Жирный (Ctrl+B)',
      'Курсив (Ctrl+I)',
      'Подзаголовок',
      'Список',
      'Нумерованный список',
      'Ссылка',
    ])
  })

  it('выбрасывает при загрузке то, чего редактор не умеет', async () => {
    renderWidget(
      <RichTextEditor
        {...feedRichTextEditor()}
        value={'<blockquote><p>цитата</p></blockquote><p><s>зачёркнуто</s><code>код</code></p>'}
      />
    )

    const field = await screen.findByRole('textbox')
    expect(field.querySelector('blockquote, s, code')).toBeNull()
    expect(field.textContent).toBe('цитатазачёркнутокод')
  })

  it('считает видимые символы и помечает превышение', async () => {
    renderWidget(
      <RichTextEditor {...feedRichTextEditor()} value="<h2>Раз</h2><p>два</p>" maxLength={5} />
    )

    const counter = await screen.findByText('6 / 5')
    expect(counter.className).toMatch(/counterOver/)
  })

  it('Enter в поле адреса ставит ссылку и не отправляет форму вокруг', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    const onChange = vi.fn()

    renderWidget(
      <form onSubmit={event => onSubmit(event.nativeEvent)}>
        <RichTextEditor {...feedRichTextEditor()} value="" onChange={onChange} />
      </form>
    )

    await screen.findByRole('textbox')
    await user.click(screen.getByRole('button', { name: 'Ссылка' }))
    const address = screen.getByRole('textbox', { name: 'Адрес ссылки' })
    await user.type(address, 'brand.com')
    fireEvent.keyDown(address, { key: 'Enter' })

    expect(onSubmit).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.stringContaining('<a href="https://brand.com">brand.com</a>')
      )
    })
  })

  it('отказывается от адреса, который не сайт, не почта и не телефон', async () => {
    const user = userEvent.setup()
    renderWidget(<RichTextEditor {...feedRichTextEditor()} value="" />)

    await screen.findByRole('textbox')
    await user.click(screen.getByRole('button', { name: 'Ссылка' }))
    await user.type(screen.getByRole('textbox', { name: 'Адрес ссылки' }), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: 'Готово' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('brand.com')
  })
})
