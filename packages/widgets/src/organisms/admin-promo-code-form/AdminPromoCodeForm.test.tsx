import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromoCodeForm } from '.'
import { feedAdminPromoCodeForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/** Сгенерированный код - с дефисом, и на сервер он уходит с ним же. */
const GENERATED = /^SULU-[A-HJ-NP-Z2-9]{5}$/
const SENT = GENERATED

const aygul = { id: 'u-1', name: 'Айгуль', phone: '+996700123456', telegramLinked: true }

/** Создание: заполняет название и добавляет награду «скидка 10%». */
const fillMinimum = async (): Promise<void> => {
  await userEvent.type(screen.getByLabelText(/Название/), 'Скидка')
  await userEvent.click(screen.getByRole('button', { name: /Награды/ }))
  await userEvent.click(screen.getByRole('button', { name: /Добавить награду/ }))
  await userEvent.type(screen.getByLabelText(/Скидка, %|Размер скидки|Процент/), '10')
}

describe('AdminPromoCodeForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('при создании код уже сгенерирован в поле: SULU-XXXXX', () => {
    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} />)

    expect(screen.getByLabelText<HTMLInputElement>(/^Код/).value).toMatch(GENERATED)
  })

  it('«Перегенерировать» ставит в поле новый код', async () => {
    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} />)
    const field = screen.getByLabelText<HTMLInputElement>(/^Код/)
    const first = field.value

    await userEvent.click(screen.getByRole('button', { name: 'Перегенерировать' }))

    expect(field.value).toMatch(GENERATED)
    expect(field.value).not.toBe(first)
  })

  it('свой код: набранное переводится в верхний регистр', async () => {
    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} />)

    await userEvent.clear(screen.getByLabelText(/^Код/))
    await userEvent.type(screen.getByLabelText(/^Код/), 'leto')

    expect(screen.getByLabelText(/^Код/)).toHaveValue('LETO')
  })

  it('неверный код не уходит: ошибка формата у поля', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await userEvent.clear(screen.getByLabelText(/^Код/))
    await userEvent.type(screen.getByLabelText(/^Код/), 'Л Е Т')
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Код - от 4 до 16 символов, пробелы не считаются')).toBeInTheDocument()
  })

  it('персональный без выбранного покупателя не уходит и раскрывает «Кому»', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /Кому/ }))
    await userEvent.click(screen.getByRole('switch', { name: /Персональный/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Выберите хотя бы одного покупателя')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Кому/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('после ошибки «Выберите покупателя» поиск по-прежнему показывает результаты', async () => {
    const props = feedAdminPromoCodeForm()

    renderWidget(
      <AdminPromoCodeForm {...props} customerSelect={{ ...props.customerSelect, query: 'Ай' }} />
    )
    await userEvent.click(screen.getByRole('button', { name: /Кому/ }))
    await userEvent.click(screen.getByRole('switch', { name: /Персональный/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(screen.getByText('Выберите хотя бы одного покупателя')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Айгуль/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Айгуль/ }))

    expect(screen.queryByText('Выберите хотя бы одного покупателя')).toBeNull()
  })

  it('ошибка прошлого сохранения не стоит рядом с баннером «Проверьте форму»', async () => {
    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} error="Такой код уже есть" />)

    expect(screen.getByText('Такой код уже есть')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(screen.getByText('Проверьте форму')).toBeInTheDocument()
    expect(screen.queryByText('Такой код уже есть')).toBeNull()
  })

  it('пустая форма создания не уходит: ошибки у полей', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Введите название промокода')).toBeInTheDocument()
    expect(screen.getByText('Добавьте хотя бы одну награду')).toBeInTheDocument()
  })

  it('в наградах нет типа «Промокод»', async () => {
    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} />)
    await userEvent.click(screen.getByRole('button', { name: /Награды/ }))
    await userEvent.click(screen.getByRole('button', { name: /Добавить награду/ }))

    expect(screen.queryByRole('option', { name: 'Промокод' })).toBeNull()
  })

  it('сохранённый код: в поле его строка, «Перегенерировать» заменяет её новой', async () => {
    const onSubmit = vi.fn()
    const props = feedAdminPromoCodeForm()

    renderWidget(
      <AdminPromoCodeForm
        {...props}
        isSaved={true}
        onSubmit={onSubmit}
        initialValues={{
          code: 'LETO2026',
          title: 'Скидка',
          descriptionHtml: null,
          startsAt: new Date(Date.now() - 86_400_000).toISOString(),
          endsAt: null,
          isEnabled: true,
          assignedUsers: [{ ...aygul, isDeleted: false }],
          usesPerCustomer: null,
          conditions: [],
          rewards: [{ type: 'DISCOUNT', kind: 'PERCENT', value: 10, target: null }],
        }}
      />
    )

    expect(screen.getByLabelText(/^Код/)).toHaveValue('LETO2026')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'LETO2026',
        endsAt: null,
        assignedUsers: [expect.objectContaining({ id: 'u-1' })],
        usesPerCustomer: null,
      })
    )

    await userEvent.click(screen.getByRole('button', { name: 'Перегенерировать' }))

    expect(
      screen.getByText('Прежний код LETO2026 перестанет работать после сохранения.')
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: expect.stringMatching(SENT) })
    )
  })

  it('минимальная форма создания уходит со сгенерированным кодом и без покупателя', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringMatching(SENT),
        title: 'Скидка',
        assignedUsers: [],
        usesPerCustomer: 1,
        endsAt: null,
      })
    )
  })

  it('персональный код можно выдать нескольким покупателям и убрать лишнего', async () => {
    const onSubmit = vi.fn()
    const props = feedAdminPromoCodeForm()
    const bermet = { id: 'u-2', name: 'Бермет', phone: '+996555987654', telegramLinked: true }

    renderWidget(
      <AdminPromoCodeForm
        {...props}
        onSubmit={onSubmit}
        customerSelect={{ ...props.customerSelect, query: 'а', results: [aygul, bermet] }}
      />
    )
    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: /Кому/ }))
    await userEvent.click(screen.getByRole('switch', { name: /Персональный/ }))
    await userEvent.click(screen.getByRole('button', { name: /Айгуль/ }))
    // Выбранный уходит из выдачи - второй раз его не добавить.
    expect(screen.queryByRole('button', { name: /^Айгуль/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Бермет/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Убрать Айгуль' }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUsers: [expect.objectContaining({ id: 'u-2' })] })
    )
  })

  it('число применений: число от 1 до 100 или «Без ограничений»', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: /Кому/ }))
    const uses = screen.getByLabelText(/Сколько раз/)
    await userEvent.clear(uses)
    await userEvent.type(uses, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Введите число от 1 до 100')).toBeInTheDocument()

    await userEvent.clear(uses)
    await userEvent.type(uses, '3')
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ usesPerCustomer: 3 }))

    await userEvent.click(screen.getByRole('switch', { name: /Без ограничений/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ usesPerCustomer: null }))
  })
})
