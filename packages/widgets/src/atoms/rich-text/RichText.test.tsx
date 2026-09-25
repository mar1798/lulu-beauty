import { describe, expect, it } from 'vitest'
import { RichText } from '.'
import { feedRichText } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('RichText', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<RichText {...feedRichText()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('собирает разрешённые теги заново — без атрибутов из исходника', () => {
    const { container } = renderWidget(
      <RichText
        html={'<p style="color:red" onclick="alert(1)">Текст <strong class="x">жирный</strong></p>'}
      />
    )

    const paragraph = container.querySelector('p')
    expect(paragraph?.getAttributeNames()).toEqual([])
    expect(container.querySelector('strong')?.getAttributeNames()).toEqual([])
    expect(paragraph?.textContent).toBe('Текст жирный')
  })

  it('разворачивает чужой тег в текст и выбрасывает скрипт целиком', () => {
    const { container } = renderWidget(
      <RichText
        html={'<h1>Заголовок</h1><script>alert(1)</script><img src="x" onerror="alert(1)">'}
      />
    )

    expect(container.querySelector('h1, script, img')).toBeNull()
    expect(container.textContent).toBe('Заголовок')
  })

  it('оставляет у ссылки только безопасный адрес и свой rel', () => {
    const { container } = renderWidget(
      <RichText
        html={
          '<a href="https://example.com" target="_blank">сайт</a><a href="javascript:alert(1)">плохая</a>'
        }
      />
    )

    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://example.com')
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer nofollow')
    expect(links[0].hasAttribute('target')).toBe(false)
    expect(container.textContent).toContain('плохая')
  })
})
