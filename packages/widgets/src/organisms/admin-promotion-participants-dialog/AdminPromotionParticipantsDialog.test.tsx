import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
