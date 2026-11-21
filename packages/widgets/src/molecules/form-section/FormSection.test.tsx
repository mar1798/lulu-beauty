import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormSection } from '.'
import { feedFormSection } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('FormSection', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<FormSection {...feedFormSection()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('заголовок - кнопка с aria-expanded, нажатие просит свернуть', async () => {
    const onToggle = vi.fn()

    renderWidget(<FormSection {...feedFormSection()} onToggle={onToggle} />)

    const trigger = screen.getByRole('button', { name: /Основное/ })

    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(trigger)

    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('свёрнутая секция не размонтирует поля и показывает сводку', () => {
    renderWidget(<FormSection {...feedFormSection()} isOpen={false} />)

    expect(screen.getByRole('button', { name: /Основное/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.getByText('Весенняя распродажа')).toBeInTheDocument()
    expect(screen.getByText('Поля секции')).toBeInTheDocument()
  })
})
