import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TelegramLoginPanel } from '.'
import { feedTelegramLoginPanel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('TelegramLoginPanel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<TelegramLoginPanel {...feedTelegramLoginPanel()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('ведёт в бота по полученной ссылке', () => {
    renderWidget(<TelegramLoginPanel {...feedTelegramLoginPanel()} />)

    expect(screen.getByRole('link', { name: /Войти через Telegram/ })).toHaveAttribute(
      'href',
      'https://t.me/lulu_beauty_test_bot?start=demo-payload'
    )
  })

  it('говорит, что сделать в Telegram, и не прячет кнопку', () => {
    renderWidget(<TelegramLoginPanel {...feedTelegramLoginPanel()} status="waiting" />)

    expect(screen.getByText(/Продолжите вход в Telegram/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Войти через Telegram/ })).toBeInTheDocument()
  })

  it('не крутит спиннер в ожидании — работы, которая идёт, тут нет', () => {
    const { container } = renderWidget(
      <TelegramLoginPanel {...feedTelegramLoginPanel()} status="waiting" />
    )

    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('на истёкшей ссылке предлагает новую вместо мёртвой кнопки', async () => {
    const onRetry = vi.fn()
    renderWidget(
      <TelegramLoginPanel {...feedTelegramLoginPanel()} status="expired" onRetry={onRetry} />
    )

    expect(screen.queryByRole('link', { name: /Войти через Telegram/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /новую ссылку/ }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
