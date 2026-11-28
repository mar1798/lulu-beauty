import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ErrorTemplate } from '.'
import { feedErrorTemplate } from '../../stories/feed'
import * as styles from './ErrorTemplate.css'
import { renderWidget } from '../../testing/render'

describe('ErrorTemplate', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ErrorTemplate {...feedErrorTemplate()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('делает заголовок первым уровнем: другого смыслового заголовка на экране нет', () => {
    renderWidget(<ErrorTemplate {...feedErrorTemplate()} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Страница не найдена')
  })

  /*
    Код — оформление, а не содержание: скринридер прочитал бы «404» как
    голое число посреди страницы, а смысл несёт заголовок рядом.
  */
  it('прячет код от скринридера', () => {
    renderWidget(<ErrorTemplate {...feedErrorTemplate()} />)

    expect(screen.getByText('404')).toHaveAttribute('aria-hidden', 'true')
  })

  it('рисуется и без кода - тем же шаблоном показывается «раздел недоступен»', () => {
    renderWidget(<ErrorTemplate title="Каталог сейчас недоступен" />)

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('404')).toBeNull()
  })

  it('decor кладётся в отдельный слой, скрытый от скринридера', () => {
    renderWidget(<ErrorTemplate {...feedErrorTemplate()} decor={<i data-testid="decor" />} />)

    const layer = screen.getByTestId('decor').parentElement as HTMLElement
    expect(layer).toHaveClass(styles.decor)
    expect(layer).toHaveAttribute('aria-hidden', 'true')
  })

  it('без decor слоя нет', () => {
    const { container } = renderWidget(<ErrorTemplate {...feedErrorTemplate()} />)

    expect(container.querySelector(`.${styles.decor}`)).toBeNull()
  })
})
