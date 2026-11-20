import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromotionBannerField } from '.'
import { feedPromotionBannerField } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('PromotionBannerField', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PromotionBannerField {...feedPromotionBannerField()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('подписывает рекомендованный размер и соотношение сторон', () => {
    renderWidget(<PromotionBannerField {...feedPromotionBannerField()} />)

    expect(screen.getByText(/1080×720 px, соотношение 3 : 2/)).toBeInTheDocument()
  })

  it('десктопный баннер — свой размер и без пометки об обязательности', () => {
    renderWidget(
      <PromotionBannerField {...feedPromotionBannerField()} variant="desktop" isRequired={false} />
    )

    expect(screen.getByText(/1920×640 px, соотношение 3 : 1/)).toBeInTheDocument()
    expect(screen.queryByText('Нужен для карусели')).toBeNull()
  })

  it('мобильный обязателен для карусели', () => {
    renderWidget(<PromotionBannerField {...feedPromotionBannerField()} />)

    expect(screen.getByText('Нужен для карусели')).toBeInTheDocument()
  })

  it('превью держит пропорцию варианта', () => {
    const { container } = renderWidget(<PromotionBannerField {...feedPromotionBannerField()} />)

    expect(container.querySelector<HTMLElement>('[style*="aspect-ratio"]')?.style.aspectRatio).toBe(
      '1080 / 720'
    )
  })

  it('«Убрать баннер» есть только у загруженного', async () => {
    const onRemove = vi.fn()
    const { rerender } = renderWidget(
      <PromotionBannerField {...feedPromotionBannerField()} onRemove={onRemove} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Убрать баннер' }))
    expect(onRemove).toHaveBeenCalledOnce()

    rerender(<PromotionBannerField {...feedPromotionBannerField()} url={null} />)
    expect(screen.queryByRole('button', { name: 'Убрать баннер' })).toBeNull()
  })

  it('кнопка выбора стоит в рамке и отдаёт подходящий файл', async () => {
    const onSelect = vi.fn()

    renderWidget(
      <PromotionBannerField {...feedPromotionBannerField()} url={null} onSelect={onSelect} />
    )

    const file = new File(['x'], 'banner.png', { type: 'image/png' })

    expect(screen.getByRole('button', { name: 'Выбрать файл' })).toBeInTheDocument()
    await userEvent.upload(screen.getByLabelText(/баннер$/), file)

    expect(onSelect).toHaveBeenCalledWith(file)
  })

  it('неподходящий формат не уходит наверх, ошибка под рамкой', async () => {
    const onSelect = vi.fn()

    renderWidget(
      <PromotionBannerField {...feedPromotionBannerField()} url={null} onSelect={onSelect} />
    )
    await userEvent.upload(
      screen.getByLabelText(/баннер$/),
      new File(['x'], 'banner.gif', { type: 'image/gif' }),
      { applyAccept: false }
    )

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Подойдёт JPG, PNG или WebP')
  })
})
