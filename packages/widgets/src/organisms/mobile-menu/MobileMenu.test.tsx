import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileMenu } from '.'
import { feedMobileMenu } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Как и модалка, панель рендерится порталом — смоук-тест из шаблона тут
 * бесполезен. Проверяем то, ради чего она нужна: доступное имя, закрытие
 * тремя способами и то, что переход по пункту её закрывает — иначе панель
 * осталась бы висеть поверх новой страницы.
 */
describe('MobileMenu', () => {
  it('рендерит панель с доступным именем вне своего поддерева', () => {
    const { container } = renderWidget(<MobileMenu {...feedMobileMenu()} />)

    expect(container.firstElementChild).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Меню' })).toBeInTheDocument()
  })

  it('не рендерит ничего, пока закрыта', () => {
    renderWidget(<MobileMenu {...feedMobileMenu()} isOpen={false} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('закрывается крестиком, по Escape и по нажатию на фон', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    renderWidget(<MobileMenu {...feedMobileMenu()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Закрыть меню' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)

    // Фон — родитель самой панели.
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement
    await user.pointer({ target: overlay, keys: '[MouseLeft>]' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('закрывается при переходе по пункту меню', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    renderWidget(<MobileMenu {...feedMobileMenu()} onClose={onClose} />)

    await user.click(screen.getByRole('link', { name: 'Каталог' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('помечает текущий раздел и показывает счётчик корзины', () => {
    renderWidget(<MobileMenu {...feedMobileMenu()} currentHref="/orders" />)

    expect(screen.getByRole('link', { name: 'Мои заявки' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Корзина/ })).toHaveTextContent('3')
  })

  it('гостю предлагает вход и регистрацию вместо профиля', () => {
    renderWidget(<MobileMenu {...feedMobileMenu()} user={null} />)

    expect(screen.getByRole('link', { name: 'Войти' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Зарегистрироваться' })).toBeInTheDocument()
  })
})
