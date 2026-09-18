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
    expect(screen.getByRole('option', { name: 'Отменена магазином' })).toBeTruthy()
  })

  it('показывает уже стоящую отмену покупателем — иначе поле выглядело бы пустым', async () => {
    renderWidget(<StatusSelect {...feedStatusSelect()} value="CANCELLED_BY_CUSTOMER" />)
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'Отменена покупателем' })).toBeTruthy()
  })

  /*
    Отменённое возвращает тот, кто отменил. Свою отмену владелец снимает здесь;
    из отмены покупателя выхода в списке нет — оттуда выходит сам покупатель.
  */
  it('даёт снять свою отмену и не даёт снять чужую', async () => {
    const { unmount } = renderWidget(
      <StatusSelect {...feedStatusSelect()} value="CANCELLED_BY_OWNER" />
    )
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Ожидает подтверждения' })).toBeTruthy()
    unmount()

    renderWidget(<StatusSelect {...feedStatusSelect()} value="CANCELLED_BY_CUSTOMER" />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('option', { name: 'Ожидает подтверждения' })).toBeNull()
  })

  /* Опустевшую заявку возвращать некуда: товаров в ней не осталось. */
  it('не предлагает вернуть в работу заявку без позиций', async () => {
    renderWidget(<StatusSelect {...feedStatusSelect()} value="CANCELLED_BY_OWNER" isEmpty={true} />)

    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('option', { name: 'Ожидает подтверждения' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Отменена магазином' })).toBeTruthy()
  })
})
