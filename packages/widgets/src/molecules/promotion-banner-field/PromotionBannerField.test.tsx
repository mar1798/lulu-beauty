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
})
