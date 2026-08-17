import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusSelect } from '.'
import { feedStatusSelect } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('StatusSelect', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<StatusSelect {...feedStatusSelect()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    «Отменена покупателем» — утверждение о чужом действии: бэкенд владельцу её не
    даст (`order_status_not_assignable`), и предлагать её в списке значит вести к
    отказу.
  */
  it('не предлагает владельцу отмену покупателем', async () => {
    renderWidget(<StatusSelect {...feedStatusSelect()} value="PENDING" />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('option', { name: 'Отменена покупателем' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Отменена владельцем' })).toBeTruthy()
  })

  it('показывает уже стоящую отмену покупателем — иначе поле выглядело бы пустым', async () => {
    renderWidget(<StatusSelect {...feedStatusSelect()} value="CANCELLED_BY_CUSTOMER" />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'Отменена покупателем' })).toBeTruthy()
  })
})
