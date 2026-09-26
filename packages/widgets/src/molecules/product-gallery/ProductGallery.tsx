import clsx from 'clsx'
import { type FC, type PointerEvent, useEffect, useRef, useState } from 'react'
import type { IBasicStyling, IProductGalleryProps } from '../../types'
import { IconBox, IconChevronLeft, IconChevronRight, IconClose } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { IconButton } from '../../atoms/icon-button'
import { Portal } from '../../atoms/portal'
import { useBackDismiss } from '../../hooks/useBackDismiss'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import * as styles from './ProductGallery.css'

/**
 * Галерея товара: большая картинка и миниатюры.
 *
 * Порядок берётся из `sortOrder`, а главной по умолчанию открывается
 * помеченная `isPrimary` — ровно так, как их сортирует и помечает админка.
 *
 * На телефоне кадр узкий (~40svh по высоте), поэтому у него два жеста: свайп
 * листает фотографии, тап открывает полноэкранный просмотр — там состав на
 * упаковке уже можно прочитать, а увеличить ещё — обычным щипком. Раньше свайп
 * не делал ничего, а дотянуться до соседнего фото можно было только миниатюрой.
 */

const MAIN_SIZES = { fb: '100vw', md: '50vw', lg: '40vw' } as const
const THUMB_SIZES = { fb: '72px' } as const
const VIEWER_SIZES = { fb: '100vw' } as const

/** Сдвиг пальца, после которого жест — свайп, а не тап. */
const SWIPE_THRESHOLD_PX = 40

/**
 * Свайп влево-вправо по кадру: `onSwipe(±1)` на горизонтальном жесте и
 * `onTap` на касании без движения. Вертикальный жест не трогаем — это прокрутка
 * страницы (`touch-action: pan-y` у кадра отдаёт её браузеру).
 */
const useSwipe = (
  onSwipe: (step: number) => void,
  onTap?: () => void
): {
  onPointerDown: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: () => void
} => {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onPointerDown: event => {
      start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: event => {
      const origin = start.current

      start.current = null

      if (origin === null) {
        return
      }

      const dx = event.clientX - origin.x
      const dy = event.clientY - origin.y

      if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        onSwipe(dx < 0 ? 1 : -1)
      } else if (Math.abs(dx) < SWIPE_THRESHOLD_PX / 4 && Math.abs(dy) < SWIPE_THRESHOLD_PX / 4) {
        onTap?.()
      }
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}

export const ProductGallery: FC<IProductGalleryProps & IBasicStyling> = ({
  images,
  productName,
  className,
}) => {
  const ordered = [...images].sort((left, right) => left.sortOrder - right.sortOrder)
  const primaryIndex = Math.max(
    ordered.findIndex(image => image.isPrimary),
    0
  )
  const [activeIndex, setActiveIndex] = useState(primaryIndex)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const active = ordered[activeIndex] ?? null
  const count = ordered.length

  /** По кругу: с последней вперёд — на первую, как у любой ленты фотографий. */
  const step = (delta: number): void => {
    if (count > 1) {
      setActiveIndex(current => (current + delta + count) % count)
    }
  }

  const mainSwipe = useSwipe(step, () => setIsViewerOpen(true))

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.main}>
        {active === null ? (
          <span className={styles.placeholder} aria-hidden={true}>
            <IconBox />
          </span>
        ) : (
          /*
            Кнопка, а не картинка с обработчиком: просмотр открывается и с
            клавиатуры, и скринридером. Указатель открывает его через `onTap`,
            потому что обычный клик сработал бы и в конце свайпа; `onClick` здесь
            — только для кликов без указателя (`detail === 0`: Enter, пробел,
            двойной тап VoiceOver).
          */
          <button
            type="button"
            className={styles.mainButton}
            aria-label={`Открыть фото во весь экран: ${productName}`}
            onClick={event => {
              if (event.detail === 0) {
                setIsViewerOpen(true)
              }
            }}
            {...mainSwipe}
          >
            <AppImage
              image={{ src: active.url, alt: active.alt ?? productName }}
              sizes={MAIN_SIZES}
              fill={true}
              priority={true}
            />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className={styles.thumbs}>
          {ordered.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={styles.thumb}
              aria-current={index === activeIndex}
              aria-label={`Фотография ${index + 1} из ${count}`}
              onClick={() => setActiveIndex(index)}
            >
              <AppImage
                image={{ src: image.url, alt: image.alt ?? productName }}
                sizes={THUMB_SIZES}
                fill={true}
              />
            </button>
          ))}
        </div>
      )}

      {active !== null && (
        <GalleryViewer
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          image={active}
          productName={productName}
          position={count > 1 ? `${activeIndex + 1} из ${count}` : null}
          onStep={step}
        />
      )}
    </div>
  )
}

/**
 * Полноэкранный просмотр: фото во весь экран без обрезки, листание стрелками,
 * свайпом и клавишами, закрытие крестиком, Escape и жестом «назад».
 */
const GalleryViewer: FC<{
  isOpen: boolean
  onClose: () => void
  image: IProductGalleryProps['images'][number]
  productName: string
  /** «2 из 5» — или `null`, когда фото одно и листать нечего. */
  position: string | null
  onStep: (delta: number) => void
}> = ({ isOpen, onClose, image, productName, position, onStep }) => {
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen)
  const requestClose = useBackDismiss(isOpen, onClose)
  const swipe = useSwipe(onStep)

  useLockBodyScroll(isOpen)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        requestClose()
      } else if (event.key === 'ArrowRight') {
        onStep(1)
      } else if (event.key === 'ArrowLeft') {
        onStep(-1)
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, requestClose, onStep])

  if (!isOpen) {
    return null
  }

  return (
    <Portal>
      <div
        ref={dialogRef}
        className={styles.viewer}
        role="dialog"
        aria-modal={true}
        aria-label={`Фото: ${productName}`}
        tabIndex={-1}
      >
        <div className={styles.viewerFrame} {...swipe}>
          {/* `fill` рисует фото целиком, без обрезки (`contain`) — упаковка видна вся. */}
          <AppImage
            image={{ src: image.url, alt: image.alt ?? productName }}
            sizes={VIEWER_SIZES}
            fill={true}
          />
        </div>

        <IconButton
          className={styles.viewerClose}
          icon={<IconClose />}
          label="Закрыть просмотр"
          variant="solid"
          onClick={requestClose}
        />

        {position !== null && (
          <div className={styles.viewerNav}>
            <IconButton
              icon={<IconChevronLeft />}
              label="Предыдущее фото"
              variant="solid"
              onClick={() => onStep(-1)}
            />
            <span className={styles.viewerPosition} aria-live="polite">
              {position}
            </span>
            <IconButton
              icon={<IconChevronRight />}
              label="Следующее фото"
              variant="solid"
              onClick={() => onStep(1)}
            />
          </div>
        )}
      </div>
    </Portal>
  )
}
