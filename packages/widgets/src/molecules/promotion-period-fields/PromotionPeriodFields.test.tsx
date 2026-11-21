import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromotionPeriodFields } from '.'
import { feedPromotionPeriodFields } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionPeriodFields', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromotionPeriodFields {...feedPromotionPeriodFields()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('«Бессрочная» прячет конец', () => {
    renderWidget(<PromotionPeriodFields {...feedPromotionPeriodFields()} isOpenEnded={true} />)

    expect(screen.getByRole('switch', { name: /Бессрочная/ })).toBeChecked()
    expect(screen.queryByLabelText('Конец, дата')).toBeNull()
  })

  it('правка даты сообщает только изменённое поле', async () => {
    const onChange = vi.fn()

    renderWidget(<PromotionPeriodFields {...feedPromotionPeriodFields()} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Начало, время'), '1')

    expect(onChange).toHaveBeenCalled()
    expect(Object.keys(onChange.mock.calls[0][0])).toEqual(['startTime'])
  })

  it('подпись и подсказка конца переопределяются', () => {
    renderWidget(
      <PromotionPeriodFields
        {...feedPromotionPeriodFields()}
        openEndedLabel="Бессрочный"
        endHint="Свой текст"
      />
    )

    expect(screen.getByRole('switch', { name: 'Бессрочный' })).toBeInTheDocument()
    expect(screen.getByText('Свой текст')).toBeInTheDocument()
  })

  it('ошибки показываются у начала и у конца', () => {
    renderWidget(
      <PromotionPeriodFields
        {...feedPromotionPeriodFields()}
        errors={{ start: 'Нет начала', end: 'Конец раньше начала' }}
      />
    )

    expect(screen.getByText('Нет начала')).toBeInTheDocument()
    expect(screen.getByText('Конец раньше начала')).toBeInTheDocument()
  })
})
