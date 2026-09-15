import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ShowcaseMore } from '.'
import { feedShowcaseMore } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('ShowcaseMore', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ShowcaseMore {...feedShowcaseMore()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /* Плитка — ссылка целиком, а не блок с ссылкой внутри. */
  it('ведёт по адресу из пропсов', () => {
    renderWidget(<ShowcaseMore {...feedShowcaseMore()} link={{ href: '/catalog' }} />)

    expect(screen.getByRole('link', { name: /Смотреть каталог/ })).toHaveAttribute(
      'href',
      '/catalog'
    )
  })

  it('обходится без подсказки', () => {
    renderWidget(<ShowcaseMore label="Смотреть каталог" link={{ href: '/catalog' }} />)

    expect(screen.getByRole('link')).toHaveTextContent('Смотреть каталог')
  })
})
