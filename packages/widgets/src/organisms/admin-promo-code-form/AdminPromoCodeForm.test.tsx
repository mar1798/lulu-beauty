import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminPromoCodeForm } from '.'
import { feedAdminPromoCodeForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

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

  it('при создании код по умолчанию генерируется: поля кода нет, есть подсказка', () => {
    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} />)

    expect(screen.getByRole('switch', { name: /Сгенерировать код автоматически/ })).toBeChecked()
    expect(screen.queryByLabelText(/^Код/)).toBeNull()
    expect(screen.getByText('Код из 8 символов появится после сохранения.')).toBeInTheDocument()
  })

  it('своего кода: поле появляется, набранное переводится в верхний регистр', async () => {
    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} />)

    await userEvent.click(screen.getByRole('switch', { name: /Сгенерировать код автоматически/ }))
    await userEvent.type(screen.getByLabelText(/^Код/), 'leto')

    expect(screen.getByLabelText(/^Код/)).toHaveValue('LETO')
  })

  it('неверный код не уходит: ошибка формата у поля', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('switch', { name: /Сгенерировать код автоматически/ }))
    await userEvent.type(screen.getByLabelText(/^Код/), 'ЛЕТО')
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('Код - от 4 до 16 латинских букв и цифр, без пробелов')
    ).toBeInTheDocument()
  })

  it('персональный без выбранного покупателя не уходит и раскрывает «Кому»', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /Кому/ }))
    await userEvent.click(screen.getByRole('switch', { name: /Персональный/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Выберите покупателя')).toBeInTheDocument()
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

    expect(screen.getByText('Выберите покупателя')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Айгуль/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Айгуль/ }))

    expect(screen.queryByText('Выберите покупателя')).toBeNull()
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

  it('сохранённый код: в поле его строка, «Сгенерировать новый» отправляет code: null', async () => {
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
          assignedUser: { ...aygul, isDeleted: false },
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
        assignedUser: expect.objectContaining({ id: 'u-1' }),
      })
    )

    await userEvent.click(screen.getByRole('button', { name: 'Сгенерировать новый' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ code: null }))
  })

  it('минимальная форма создания уходит с code: null и без покупателя', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminPromoCodeForm {...feedAdminPromoCodeForm()} onSubmit={onSubmit} />)
    await fillMinimum()
    await userEvent.click(screen.getByRole('button', { name: 'Создать промокод' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ code: null, title: 'Скидка', assignedUser: null, endsAt: null })
    )
  })
})
