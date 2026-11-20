import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromotionParticipantsDialog } from '.'
import { feedAdminPromotionParticipantsDialog } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('AdminPromotionParticipantsDialog', () => {
  it('показывает участников, а снятое участие помечает', () => {
    renderWidget(<AdminPromotionParticipantsDialog {...feedAdminPromotionParticipantsDialog()} />)

    expect(screen.getByText('Айгуль')).toBeInTheDocument()
    expect(screen.getByText('Нурзат')).toBeInTheDocument()
    expect(screen.getByText('Снято')).toBeInTheDocument()
  })

  it('участники - строками таблицы', () => {
    renderWidget(<AdminPromotionParticipantsDialog {...feedAdminPromotionParticipantsDialog()} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Покупатель' })).toBeInTheDocument()
  })

  it('листает страницы, когда участников больше одной страницы', async () => {
    const onPageChange = vi.fn()

    renderWidget(
      <AdminPromotionParticipantsDialog
        {...feedAdminPromotionParticipantsDialog()}
        onPageChange={onPageChange}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Страница 2' }))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('на одной странице пагинации нет', () => {
    renderWidget(
      <AdminPromotionParticipantsDialog {...feedAdminPromotionParticipantsDialog()} total={2} />
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('пока список грузится — скелетон, без «никто не участвовал»', () => {
    renderWidget(
      <AdminPromotionParticipantsDialog
        {...feedAdminPromotionParticipantsDialog()}
        participants={null}
      />
    )

    expect(screen.queryByText(/Пока никто/)).toBeNull()
  })

  it('пустой список говорит об этом словами', () => {
    renderWidget(
      <AdminPromotionParticipantsDialog
        {...feedAdminPromotionParticipantsDialog()}
        participants={[]}
      />
    )

    expect(screen.getByText(/Пока никто не участвовал/)).toBeInTheDocument()
  })

  it('ошибка загрузки — в алерте', () => {
    renderWidget(
      <AdminPromotionParticipantsDialog
        {...feedAdminPromotionParticipantsDialog()}
        error="Нет связи"
      />
    )

    expect(screen.getByText('Нет связи')).toBeInTheDocument()
  })
})
