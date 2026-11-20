import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromoCodeDialog } from '.'
import { feedAdminPromoCodeDialog } from '../../stories/feed'
import { newRewardDraft } from '../../utils/promotion'
import { renderWidget } from '../../testing/render'

describe('AdminPromoCodeDialog', () => {
  it('рендерится с фикстурой из feed', () => {
    renderWidget(<AdminPromoCodeDialog {...feedAdminPromoCodeDialog()} />)

    expect(screen.getByRole('dialog', { name: 'Настройки промокода' })).toBeInTheDocument()
  })

  it('без наград не сохраняет и объясняет почему', async () => {
    const onSave = vi.fn()

    renderWidget(<AdminPromoCodeDialog {...feedAdminPromoCodeDialog()} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/Добавьте, что даёт промокод/)).toBeInTheDocument()
  })

  it('сохраняет готовый черновик', async () => {
    const onSave = vi.fn()
    const props = feedAdminPromoCodeDialog()

    renderWidget(
      <AdminPromoCodeDialog
        {...props}
        value={{ ...props.value, rewards: [{ ...newRewardDraft('DISCOUNT'), value: '10' }] }}
        onSave={onSave}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSave).toHaveBeenCalledOnce()
  })

  it('«Отмена» закрывает окно без сохранения', async () => {
    const onClose = vi.fn()
    const onSave = vi.fn()

    renderWidget(
      <AdminPromoCodeDialog {...feedAdminPromoCodeDialog()} onClose={onClose} onSave={onSave} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })
})
