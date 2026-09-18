import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { LegalTemplate } from '.'
import { feedLegalTemplate } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('LegalTemplate', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<LegalTemplate {...feedLegalTemplate()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('нумерует разделы сам и даёт каждому якорь', () => {
    // Номер — это адрес пункта: на него ссылаются извне, и вписанный в текст
    // руками он разъедется с порядком при первой вставке раздела в середину.
    renderWidget(<LegalTemplate {...feedLegalTemplate()} />)

    const first = screen.getByRole('heading', { name: '1. Какие данные мы собираем' })
    const second = screen.getByRole('heading', { name: '2. Как удалить аккаунт' })

    expect(first.id).toBe('section-1')
    expect(second.id).toBe('section-2')
  })

  it('рисует массив строк списком, а строку — абзацем', () => {
    renderWidget(<LegalTemplate {...feedLegalTemplate()} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('показывает дату редакции словами, а машине отдаёт ISO', () => {
    // Человек, вернувшийся через полгода, должен видеть, ту же ли бумагу читает,
    // а ISO-дата в тексте документа читается как артефакт выгрузки.
    const { container } = renderWidget(<LegalTemplate {...feedLegalTemplate()} />)
    const time = container.querySelector('time')

    expect(time?.getAttribute('datetime')).toBe('2026-09-18')
    expect(time?.textContent).toContain('сентября 2026')
  })
})
