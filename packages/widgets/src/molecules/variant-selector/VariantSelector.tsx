import clsx from 'clsx'
import { type FC, type KeyboardEvent, useRef } from 'react'
import type { IBasicStyling, IVariantSelectorProps } from '../../types'
import { Text } from '../../atoms/text'
import { formatVolume } from '../../utils/volume'
import * as styles from './VariantSelector.css'

/**
 * Выбор объёма на странице товара: один ряд кнопок-переключателей.
 *
 * Радиогруппа, а не набор независимых тумблеров: объём у позиции ровно один, и
 * `role="radiogroup"` — единственное, что сообщает это скринридеру. Группа —
 * одна остановка Tab (roving tabindex), а между кнопками внутри неё ходят
 * стрелками. Стрелки обрабатываются здесь, и иначе никак: браузер водит ими
 * только по нативным `<input type="radio">`, а у `role="radio"` на кнопке
 * такого поведения нет — без обработчика с клавиатуры был доступен ровно один
 * объём, выбранный, и переключиться на другой было нельзя.
 *
 * Выбор следует за фокусом, как в обычной радиогруппе: стрелка и выбирает, и
 * переводит фокус.
 *
 * **Кнопка — только объём, и выбрать можно любую.** Ни цены, ни наличия под
 * ней нет: и то и другое живёт в строке над переключателем и относится к
 * выбранному объёму. Ряд из одинаковых кнопок читается как «какой размер вам
 * нужен», а не как прайс-лист, а кончившийся объём остаётся выбираемым — иначе
 * узнать его цену было бы негде, а отключённая кнопка выглядит так, будто
 * магазин таких и не продаёт. Что именно нельзя положить в корзину, говорит
 * метка наличия и погашенная кнопка «в корзину».
 */
export const VariantSelector: FC<IVariantSelectorProps & IBasicStyling> = ({
  variants,
  selectedId,
  onSelect,
  className,
}) => {
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  /*
    Кто в группе держит Tab. Обычно выбранный; если выбранного нет вовсе —
    первый, иначе в группу не войти с клавиатуры.
  */
  const isSelectedReachable = variants.some(variant => variant.id === selectedId)
  const tabStopId = isSelectedReachable ? selectedId : (variants[0]?.id ?? null)

  const move = (fromId: string, step: number): void => {
    const current = variants.findIndex(variant => variant.id === fromId)
    if (current === -1) {
      return
    }

    // По кругу: с последнего объёма стрелка вправо ведёт на первый — так же,
    // как браузер водит по нативной радиогруппе.
    const count = variants.length
    const next = variants[(current + step + count) % count]

    onSelect(next.id)
    buttons.current.get(next.id)?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, variantId: string): void => {
    /*
      Вертикальные стрелки наравне с горизонтальными: ряд переносится на узком
      экране, и «вниз» там — это следующая кнопка, а не следующий блок страницы.
    */
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        move(variantId, 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        move(variantId, -1)
        break
      case 'Home':
      case 'End': {
        const target = event.key === 'Home' ? variants[0] : variants[variants.length - 1]
        if (target === undefined) {
          break
        }
        event.preventDefault()
        onSelect(target.id)
        buttons.current.get(target.id)?.focus()
        break
      }
      default:
        break
    }
  }

  return (
    <div className={clsx(styles.container, className)} role="radiogroup" aria-label="Объём">
      {variants.map(variant => {
        const isSelected = variant.id === selectedId
        const volume = formatVolume(variant.volumeMl)

        return (
          <button
            key={variant.id}
            ref={node => {
              if (node === null) {
                buttons.current.delete(variant.id)
              } else {
                buttons.current.set(variant.id, node)
              }
            }}
            type="button"
            role="radio"
            className={styles.option}
            aria-checked={isSelected}
            // Невыбранные выходят из табуляции: группа — это одна остановка Tab,
            // дальше ходят стрелками.
            tabIndex={variant.id === tabStopId ? 0 : -1}
            onClick={() => onSelect(variant.id)}
            onKeyDown={event => handleKeyDown(event, variant.id)}
          >
            {/*
              Цвет — от кнопки: у выбранной фон акцентный, и собственный цвет
              атома `Text` оставлял объём тёмным на сливовом.
            */}
            <Text as="span" className={styles.volume} size="sm" weight="semibold">
              {volume ?? 'Один размер'}
            </Text>
          </button>
        )
      })}
    </div>
  )
}
