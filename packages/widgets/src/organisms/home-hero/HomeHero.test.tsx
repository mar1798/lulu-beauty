import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { HomeHero } from '.'
import { feedHomeHero } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'
import { renderWidget } from '../../testing/render'

describe('HomeHero', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<HomeHero {...feedHomeHero()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /* Заголовок первого экрана — единственный `h1` главной. */
  it('держит заголовок первым уровнем', () => {
    const feed = feedHomeHero()
    // Заголовок приходит готовой разбивкой на строки — маска выхода построчная.
    const lines = Array.isArray(feed.title) ? feed.title : [feed.title]

    renderWidget(<HomeHero {...feed} />)

    const heading = screen.getByRole('heading', { level: 1 })

    for (const line of lines) {
      expect(heading).toHaveTextContent(line)
    }

    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('не рисует пустые слоты, когда их не передали', () => {
    const { container } = renderWidget(<HomeHero title="Заголовок" />)

    expect(container.textContent).toBe('Заголовок')
  })

  /*
    Витрина — слот, а не список товаров: герой обязан отдать её содержимое
    наружу как есть, ничего не зная про карточки.
  */
  it('показывает витрину как есть', () => {
    renderWidget(
      <HomeHero
        title="Заголовок"
        showcase={<a href="/catalog/toner">Тонер</a>}
        badge="Сбор открыт"
        status="2 дн 14 час"
        note="214 товаров · 26 брендов"
      />
    )

    expect(screen.getByRole('link', { name: 'Тонер' })).toBeInTheDocument()
    expect(screen.getByText('Сбор открыт')).toBeInTheDocument()
    expect(screen.getByText('2 дн 14 час')).toBeInTheDocument()
    expect(screen.getByText('214 товаров · 26 брендов')).toBeInTheDocument()
  })

  /*
    Первый экран обязан приезжать статикой на своём месте.

    Слои ухода — motion-элементы, а Motion печатает в разметку начальное
    значение каждого своего значения. Пока прогресс героя отсчитывался от
    `start end` (как у всего, что въезжает в кадр снизу), этим значением был
    не ноль, а полная амплитуда: сервер отдавал `translateY(96px)`, статика
    красила заголовок на 96 пикселей ниже места и подскакивала на гидратации.
    Тест держит именно это — не реализацию, а то, что в серверной разметке
    героя нет ни одного смещения.
  */
  it('не печатает смещения ухода в серверную разметку', () => {
    const html = renderToString(
      <StoryWrapper>
        <HomeHero {...feedHomeHero()} showcase={<a href="/catalog">Тонер</a>} scrollHint="Ниже" />
      </StoryWrapper>
    )

    expect(html).not.toMatch(/translate/i)
  })
})
