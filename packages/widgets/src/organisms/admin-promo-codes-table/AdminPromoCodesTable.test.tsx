import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromoCodesTable } from '.'
import { feedAdminPromoCode, feedAdminPromoCodesTable } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/** Раскрывает меню «⋯» строки и возвращает его. */
const openMenu = async (code: string): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: `Действия «${code}»` }))

  return screen.getByRole('menu', { name: `Действия «${code}»` })
}

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
    const assignedUsers = [
      { id: 'u-1', name: 'Айгуль', phone: '+996000000000', telegramLinked: false, isDeleted: true },
    ]

    renderWidget(
      <AdminPromoCodesTable {...props} promoCodes={[feedAdminPromoCode({ assignedUsers })]} />
    )

    expect(screen.getByText('Аккаунт удалён')).toBeInTheDocument()
    expect(screen.queryByText('+996000000000')).toBeNull()
  })

  it('у кода на нескольких покупателей - первый и «ещё N», и сколько раз', () => {
    const props = feedAdminPromoCodesTable()
    const person = (
      id: string,
      name: string
    ): (typeof props.promoCodes)[0]['assignedUsers'][0] => ({
      id,
      name,
      phone: '+996',
      telegramLinked: true,
      isDeleted: false,
    })

    renderWidget(
      <AdminPromoCodesTable
        {...props}
        promoCodes={[
          feedAdminPromoCode({
            assignedUsers: [person('1', 'Айгуль'), person('2', 'Бермет'), person('3', 'Чолпон')],
            usesPerCustomer: null,
            participantsCount: 9,
          }),
        ]}
      />
    )

    expect(screen.getByText('Айгуль и ещё 2 покупателя')).toBeInTheDocument()
    expect(screen.getByText('без ограничений, раз за сбор')).toBeInTheDocument()
    // Без ограничений код не «использован», сколько бы его ни применяли.
    expect(screen.queryByText('Использован')).toBeNull()
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

  it('колонки «Применений» нет, в строке - копирование и меню «⋯»', () => {
    renderWidget(<AdminPromoCodesTable {...feedAdminPromoCodesTable()} />)

    expect(screen.queryByRole('columnheader', { name: 'Применений' })).toBeNull()

    const [, first] = screen.getAllByRole('row')

    expect(within(first).getAllByRole('button')).toHaveLength(2)
  })

  it('удаление использованного кода называется «В архив», неиспользованного - «Удалить»', async () => {
    renderWidget(<AdminPromoCodesTable {...feedAdminPromoCodesTable()} />)

    expect(
      within(await openMenu('LETO2026')).getByRole('menuitem', { name: 'В архив' })
    ).toBeInTheDocument()
    expect(
      within(await openMenu('ZIMA2026')).getByRole('menuitem', { name: 'Удалить' })
    ).toBeInTheDocument()
  })

  it('удаление из меню отдаёт код странице', async () => {
    const onDelete = vi.fn()
    const props = feedAdminPromoCodesTable()

    renderWidget(<AdminPromoCodesTable {...props} onDelete={onDelete} />)
    await userEvent.click(
      within(await openMenu('LETO2026')).getByRole('menuitem', { name: 'В архив' })
    )

    expect(onDelete).toHaveBeenCalledWith(props.promoCodes[0])
  })

  it('архивному коду не предлагает ни включить, ни удалить', async () => {
    const props = feedAdminPromoCodesTable()
    const archived = feedAdminPromoCode({
      deletedAt: new Date().toISOString(),
      status: 'ARCHIVED',
    })

    renderWidget(<AdminPromoCodesTable {...props} promoCodes={[archived]} />)

    const menu = await openMenu(archived.code)

    expect(within(menu).queryByRole('menuitem', { name: /^(Включить|Выключить)$/ })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: /^(Удалить|В архив)$/ })).toBeNull()
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
