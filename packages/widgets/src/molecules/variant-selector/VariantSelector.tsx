import clsx from 'clsx'
import { type FC, type KeyboardEvent, useRef } from 'react'
import type { IBasicStyling, IVariantSelectorProps } from '../../types'
import { Text } from '../../atoms/text'
import { shadeKey, variantShades, variantVolumes } from '../../utils/variants'
import { formatVolume } from '../../utils/volume'
import * as styles from './VariantSelector.css'

/** Один вариант выбора в ряду: объём или тон. */
interface IOption {
  id: string
  label: string
  /** Всё, что этот вариант выбора открывает, кончилось: кнопка приглушена, но выбирается. */
  isUnavailable: boolean
}

interface IOptionGroupProps {
  label: string
  options: IOption[]
  selectedId: string | null
  onSelect: (optionId: string) => void
  /** Подпись над рядом; без неё группу называет только `aria-label`. */
  caption?: string
}

/**
 * Выбор варианта на странице товара: ряд кнопок-переключателей на каждую ось —
 * объём и тон.
 *
 * Оси независимы: тоналка бывает и в 30, и в 50 мл каждого тона. Ряд тонов
 * показывает только тона выбранного объёма, а смена объёма сохраняет тон,
 * если в новом объёме он есть, — иначе встаёт на первый тон в наличии. Наверх
 * уходит всегда id варианта: корзине нужен он, а не пара «объём + тон».
 *
 * Тон в наличии или нет, видно по самой кнопке — она приглушена. У объёмов
 * это было не нужно (их два-три, и строка над переключателем говорит про
 * выбранный), но тонов бывает сорок, и перебирать их по одному, чтобы найти
 * те, что есть, — не выбор, а обыск.
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
 * **Кнопка — только объём или тон, и выбрать можно любую.** Ни цены, ни наличия под
 * ней нет: и то и другое живёт в строке над переключателем и относится к
 * выбранному объёму. Ряд из одинаковых кнопок читается как «какой размер вам
 * нужен», а не как прайс-лист, а кончившийся объём остаётся выбираемым — иначе
 * узнать его цену было бы негде, а отключённая кнопка выглядит так, будто
 * магазин таких и не продаёт. Что именно нельзя положить в корзину, говорит
 * метка наличия и погашенная кнопка «в корзину».
 */
const OptionGroup: FC<IOptionGroupProps> = ({ label, options, selectedId, onSelect, caption }) => {
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  /*
    Кто в группе держит Tab. Обычно выбранный; если выбранного нет вовсе —
    первый, иначе в группу не войти с клавиатуры.
  */
  const isSelectedReachable = options.some(option => option.id === selectedId)
  const tabStopId = isSelectedReachable ? selectedId : (options[0]?.id ?? null)

  const select = (target: IOption | undefined): void => {
    if (target === undefined) {
      return
    }

    onSelect(target.id)
    buttons.current.get(target.id)?.focus()
  }

  const move = (fromId: string, step: number): void => {
    const current = options.findIndex(option => option.id === fromId)
    if (current === -1) {
      return
    }

    // По кругу: с последней кнопки стрелка вправо ведёт на первую — так же,
    // как браузер водит по нативной радиогруппе.
    const count = options.length
    select(options[(current + step + count) % count])
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, optionId: string): void => {
    /*
      Вертикальные стрелки наравне с горизонтальными: ряд переносится на узком
      экране, и «вниз» там — это следующая кнопка, а не следующий блок страницы.
    */
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        move(optionId, 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        move(optionId, -1)
        break
      case 'Home':
      case 'End':
        event.preventDefault()
        select(event.key === 'Home' ? options[0] : options[options.length - 1])
        break
      default:
        break
    }
  }

  return (
    <div className={styles.group}>
      {caption !== undefined && (
        <Text as="span" size="sm" tone="secondary">
          {caption}
        </Text>
      )}
      <div className={styles.container} role="radiogroup" aria-label={label}>
        {options.map(option => (
          <button
            key={option.id}
            ref={node => {
              if (node === null) {
                buttons.current.delete(option.id)
              } else {
                buttons.current.set(option.id, node)
              }
            }}
            type="button"
            role="radio"
            className={styles.option}
            aria-checked={option.id === selectedId}
            data-unavailable={option.isUnavailable}
            // Невыбранные выходят из табуляции: группа — это одна остановка Tab,
            // дальше ходят стрелками.
            tabIndex={option.id === tabStopId ? 0 : -1}
            onClick={() => onSelect(option.id)}
            onKeyDown={event => handleKeyDown(event, option.id)}
          >
            {/*
              Цвет — от кнопки: у выбранной фон акцентный, и собственный цвет
              атома `Text` оставлял подпись тёмной на сливовом.
            */}
            <Text as="span" className={styles.volume} size="sm" weight="semibold">
              {option.label}
            </Text>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Ключ объёма для id кнопки: `null` — «без объёма», а id обязан быть строкой. */
const volumeOptionId = (volumeMl: number | null): string => `volume:${volumeMl ?? 'none'}`

export const VariantSelector: FC<IVariantSelectorProps & IBasicStyling> = ({
  variants,
  selectedId,
  onSelect,
  className,
}) => {
  const selected = variants.find(variant => variant.id === selectedId) ?? null
  const volumes = variantVolumes(variants)
  const hasShades = variantShades(variants).length > 0

  /*
    Товар без тонов — прежний один ряд, где кнопка и есть вариант: id кнопки —
    id варианта, и выбор уходит наверх как есть.
  */
  if (!hasShades) {
    return (
      <div className={clsx(styles.root, className)}>
        <OptionGroup
          label="Объём"
          selectedId={selectedId}
          onSelect={onSelect}
          options={variants.map(variant => ({
            id: variant.id,
            label: formatVolume(variant.volumeMl) ?? 'Один размер',
            isUnavailable: false,
          }))}
        />
      </div>
    )
  }

  /* Ось объёма — та, что выбрана, или первая: ряд тонов показывает тона одного объёма. */
  const currentVolume = selected?.volumeMl ?? variants[0]?.volumeMl ?? null
  const currentShadeKey = shadeKey(selected?.shade)
  const ofVolume = variants.filter(variant => variant.volumeMl === currentVolume)

  const selectVolume = (optionId: string): void => {
    const volume = volumes.find(candidate => volumeOptionId(candidate) === optionId)
    const candidates = variants.filter(variant => variant.volumeMl === volume)
    const target =
      candidates.find(variant => shadeKey(variant.shade) === currentShadeKey) ??
      candidates.find(variant => variant.inStock) ??
      candidates[0]

    if (target !== undefined) {
      onSelect(target.id)
    }
  }

  return (
    <div className={clsx(styles.root, className)}>
      {volumes.length > 1 && (
        <OptionGroup
          label="Объём"
          caption="Объём"
          selectedId={selected === null ? null : volumeOptionId(selected.volumeMl)}
          onSelect={selectVolume}
          options={volumes.map(volume => ({
            id: volumeOptionId(volume),
            label: formatVolume(volume) ?? 'Один размер',
            isUnavailable: !variants.some(
              variant => variant.volumeMl === volume && variant.inStock
            ),
          }))}
        />
      )}

      <OptionGroup
        label="Тон"
        caption={selected?.shade ? `Тон: ${selected.shade}` : 'Тон'}
        selectedId={selectedId}
        onSelect={onSelect}
        options={ofVolume.map(variant => ({
          id: variant.id,
          label: variant.shade ?? 'Без тона',
          isUnavailable: !variant.inStock,
        }))}
      />
    </div>
  )
}
