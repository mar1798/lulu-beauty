import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromoCodesTable } from '.'
import { feedAdminPromoCode, feedAdminPromoCodesTable } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('AdminPromoCodesTable', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminPromoCodesTable {...feedAdminPromoCodesTable()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('у общего кода в колонке «Кому» - «Все», у персонального - имя и телефон', () => {
    renderWidget(<AdminPromoCodesTable {...feedAdminPromoCodesTable()} />)

    const [, general, personal] = screen.getAllByRole('row')

    expect(within(general).getByText('Все')).toBeInTheDocument()
    expect(within(personal).getByText('Айгуль')).toBeInTheDocument()
    expect(within(personal).getByText('+996700123456')).toBeInTheDocument()
  })

  it('у стёртого аккаунта вместо телефона - «Аккаунт удалён»', () => {
    const props = feedAdminPromoCodesTable()
    const assignedUser = {
      id: 'u-1',
      name: 'Айгуль',
      phone: '+996000000000',
      telegramLinked: false,
      isDeleted: true,
    }

    renderWidget(
      <AdminPromoCodesTable {...props} promoCodes={[feedAdminPromoCode({ assignedUser })]} />
    )

    expect(screen.getByText('Аккаунт удалён')).toBeInTheDocument()
    expect(screen.queryByText('+996000000000')).toBeNull()
  })

  it('бессрочный код - «бессрочно», с датой окончания - диапазон', () => {
    renderWidget(<AdminPromoCodesTable {...feedAdminPromoCodesTable()} />)

    expect(screen.getAllByText(/бессрочно/)).toHaveLength(2)
  })

  it('персональный использованный код помечен «Использован», общий - нет', () => {
    renderWidget(<AdminPromoCodesTable {...feedAdminPromoCodesTable()} />)

    expect(screen.getAllByText('Использован')).toHaveLength(1)
  })

  it('кнопка копирования отдаёт код странице', async () => {
    const onCopy = vi.fn()
    const props = feedAdminPromoCodesTable()

    renderWidget(<AdminPromoCodesTable {...props} onCopy={onCopy} />)
    await userEvent.click(screen.getByRole('button', { name: 'Скопировать код «LETO2026»' }))

    expect(onCopy).toHaveBeenCalledWith(props.promoCodes[0])
  })

  it('удаление использованного кода называется «В архив», неиспользованного - «Удалить»', () => {
    renderWidget(<AdminPromoCodesTable {...feedAdminPromoCodesTable()} />)

    expect(screen.getByRole('button', { name: 'В архив «LETO2026»' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Удалить «ZIMA2026»' })).toBeInTheDocument()
  })

  it('архивному коду не предлагает ни включить, ни удалить', () => {
    const props = feedAdminPromoCodesTable()
    const archived = feedAdminPromoCode({
      deletedAt: new Date().toISOString(),
      status: 'ARCHIVED',
    })

    renderWidget(<AdminPromoCodesTable {...props} promoCodes={[archived]} />)

    expect(screen.queryByRole('button', { name: /^Выключить/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Удалить|В архив)/ })).toBeNull()
    expect(screen.getByText('В архиве')).toBeInTheDocument()
  })

  it('без кодов показывает emptyState', () => {
    renderWidget(
      <AdminPromoCodesTable
        {...feedAdminPromoCodesTable()}
        promoCodes={[]}
        emptyState={<p>Промокодов нет</p>}
      />
    )

    expect(screen.getByText('Промокодов нет')).toBeInTheDocument()
  })
})
