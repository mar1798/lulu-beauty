import clsx from 'clsx'
import { type DragEvent, type FC, type ReactElement, useId, useRef, useState } from 'react'
import type {
  IAdminProductGalleryProps,
  IBasicStyling,
  IProductImage,
  IProductImageUpload,
  IProductVariant,
  IVariantTags,
} from '../../types'
import { IconChevronLeft, IconChevronRight, IconPencil, IconPlus } from '../../svg/icons'
import { Alert } from '../../atoms/alert'
import { AppImage } from '../../atoms/app-image'
import { Button } from '../../atoms/button'
import { Checkbox } from '../../atoms/checkbox'
import { Chip } from '../../atoms/chip'
import { Heading } from '../../atoms/heading'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Select } from '../../atoms/select'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { Modal } from '../modal'
import {
  formatVariant,
  imagesForVariant,
  shadeKey,
  taggableVolumes,
  variantShades,
} from '../../utils/variants'
import { formatVolume } from '../../utils/volume'
import * as styles from './AdminProductGallery.css'

/**
 * Галерея товара в админке, разложенная по тонам.
 *
 * Владелец думает не «к каким вариантам относится это фото», а «у тона
 * 05 Rose вот эти фото». Поэтому галерея — это группы: «Для всех тонов»,
 * по группе на каждый тон, и кнопка «Добавить» в каждой. Фото, добавленное
 * в группу тона, сразу к нему и привязано — выбирать ничего не нужно. У
 * товара без тонов, но в нескольких объёмах, группы — по объёмам; у товара
 * в одном варианте группа одна.
 *
 * Редкие случаи живут в окне фото (нажатие на превью): снимок двух тюбиков
 * рядом — галочками на нескольких тонах (такие фото собираются в группу
 * «Для нескольких тонов»), привязка к объёму у товара с тонами, описание
 * (alt), «главное фото», скрытие и удаление. Скрытое фото уходит в группу
 * «Скрытые»: покупатель его не видит, а владелец — видит и может вернуть.
 *
 * Как это хранится — не меняется: метки `shades` / `volumesMl` (пусто —
 * «любой») и флаг `hidden` (см. «A product has a gallery» в docs/domain.md).
 * Галерея только раскладывает их по группам и собирает обратно.
 *
 * Порядок — стрелками внутри группы: они меняют фото местами с соседом по
 * группе, а порядок остальных не трогают. Между группами порядок ни на что не
 * влияет — у фото разных групп разная точность, и витрина ставит их по ней.
 * Главное фото (первое в галерее) назначается в окне фото.
 *
 * Внизу — «Как увидит покупатель»: выбранный вариант и фото в том порядке, в
 * каком их покажет страница товара, тем же `imagesForVariant`, что и у неё.
 */

/** `MAX_PRODUCT_IMAGES` бэкенда. */
const MAX_IMAGES = 20

/** Потолок `MAX_IMAGE_BYTES` бэкенда: файл там пережимается в WebP, лимит — на загрузке. */
const IMAGE_MAX_BYTES = 15 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_SIZES = { fb: '160px' } as const

/** `MAX_IMAGE_ALT_LENGTH` бэкенда — столько отводит колонка. */
const ALT_MAX_LENGTH = 255

const ANY: IVariantTags = { volumesMl: [], shades: [], hidden: false }

/** По чему раскладывается галерея: по тонам, по объёмам или никак. */
type IAxis = 'shade' | 'volume' | null

interface IGroup {
  key: string
  title: string
  hint?: string
  /** Привязка фото, добавленного в группу; `null` — в группу не добавляют. */
  tags: IVariantTags | null
}

type IScope = 'all' | 'some' | 'hidden'

/** Что набрано в окне фото — до «Сохранить» наружу не уходит. */
interface IDraft {
  alt: string
  scope: IScope
  /** Выбранные тона (у товара с тонами) или объёмы (у товара без них). */
  picked: string[]
  /** Привязка к объёму у товара с тонами: все объёмы или выбранные. */
  isVolumeLimited: boolean
  volumes: number[]
  isPrimary: boolean
}

const axisOf = (variants: IAdminProductGalleryProps['variants']): IAxis => {
  if (variantShades(variants).length > 0) {
    return 'shade'
  }

  return taggableVolumes(variants).length > 0 ? 'volume' : null
}

/** Тона фото, которые у товара есть, в написании товара. */
const liveShades = (image: IProductImage, shades: string[]): string[] => {
  const keys = new Set((image.shades ?? []).map(shadeKey))

  return shades.filter(shade => keys.has(shadeKey(shade)))
}

const liveVolumes = (image: IProductImage, volumes: number[]): number[] =>
  volumes.filter(volume => (image.volumesMl ?? []).includes(volume))

/** Группа фото: скрытое, общее, одного тона (объёма) или нескольких. */
const groupKeyOf = (
  image: IProductImage,
  axis: IAxis,
  shades: string[],
  volumes: number[]
): string => {
  if (image.hidden === true) {
    return 'hidden'
  }

  if (axis === 'shade') {
    const own = liveShades(image, shades)

    if (own.length === 0) {
      return 'all'
    }

    return own.length === 1 ? `shade:${shadeKey(own[0]) ?? ''}` : 'several'
  }

  if (axis === 'volume') {
    const own = liveVolumes(image, volumes)

    if (own.length === 0) {
      return 'all'
    }

    return own.length === 1 ? `volume:${own[0]}` : 'several'
  }

  return 'all'
}

const buildGroups = (axis: IAxis, shades: string[], volumes: number[]): IGroup[] => {
  if (axis === null) {
    return [{ key: 'all', title: 'Все фото', tags: ANY }]
  }

  const isShade = axis === 'shade'
  const own: IGroup[] = isShade
    ? shades.map(shade => ({
        key: `shade:${shadeKey(shade) ?? ''}`,
        title: shade,
        hint: 'Своих фото нет - при этом тоне покажутся общие',
        tags: { volumesMl: [], shades: [shade], hidden: false },
      }))
    : volumes.map(volume => ({
        key: `volume:${volume}`,
        title: formatVolume(volume) ?? String(volume),
        hint: 'Своих фото нет - при этом объёме покажутся общие',
        tags: { volumesMl: [volume], shades: [], hidden: false },
      }))

  return [
    {
      key: 'all',
      title: isShade ? 'Для всех тонов' : 'Для всех объёмов',
      hint: isShade
        ? 'Видны при любом тоне - после фото самого тона'
        : 'Видны при любом объёме - после фото самого объёма',
      tags: ANY,
    },
    ...own,
    {
      key: 'several',
      title: isShade ? 'Для нескольких тонов' : 'Для нескольких объёмов',
      hint: isShade
        ? 'Например, палетка или два тюбика рядом'
        : 'Фото, отмеченные на нескольких объёмах',
      tags: null,
    },
    {
      key: 'hidden',
      title: 'Скрытые',
      hint: 'Покупатели их не видят. Вернуть или удалить - в окне фото',
      tags: null,
    },
  ]
}

/** Подходит ли привязка хоть одному варианту — то же, что проверяет сервер. */
const fitsSomeVariant = (
  variants: IAdminProductGalleryProps['variants'],
  volumesMl: number[],
  shades: string[]
): boolean => {
  const keys = shades.map(shadeKey)

  return variants.some(
    variant =>
      (volumesMl.length === 0 ||
        (variant.volumeMl !== null && volumesMl.includes(variant.volumeMl))) &&
      (keys.length === 0 || keys.includes(shadeKey(variant.shade)))
  )
}

/** Галерея с порядком, записанным в сами фото: `sortOrder` и главное — первое. */
const renumber = (images: IProductImage[]): IProductImage[] =>
  images.map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 }))

/** Варианты для предпросмотра: каждая пара объём + тон один раз, по порядку. */
const previewOptions = (
  variants: IAdminProductGalleryProps['variants']
): Array<Pick<IProductVariant, 'volumeMl' | 'shade'>> => {
  const seen = new Set<string>()

  return variants.filter(variant => {
    const key = `${variant.volumeMl ?? ''}|${shadeKey(variant.shade) ?? ''}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const BYTES_IN_MB = 1024 * 1024

/** Почему файл не подошёл, или `null`. Те же лимиты, что у `FileDropzone` в форме. */
const fileProblem = (file: File): string | null => {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'формат не JPEG, PNG или WebP'
  }

  return file.size > IMAGE_MAX_BYTES ? `больше ${IMAGE_MAX_BYTES / BYTES_IN_MB} МБ` : null
}

export const AdminProductGallery: FC<IAdminProductGalleryProps & IBasicStyling> = ({
  images,
  variants,
  productName,
  onChange,
  onAdd,
  onDelete,
  isBusy = false,
  error,
  hint,
  className,
}) => {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  /** Группа, в которую добавляются выбранные файлы: кнопка «Добавить» ставит её перед диалогом. */
  const targetRef = useRef<IVariantTags>(ANY)
  const [fileError, setFileError] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<IDraft | null>(null)
  const [isDraftSubmitted, setIsDraftSubmitted] = useState(false)
  const [previewIndex, setPreviewIndex] = useState('0')

  const axis = axisOf(variants)
  const shades = variantShades(variants)
  const volumes = taggableVolumes(variants)
  const groups = buildGroups(axis, shades, volumes)
  const keyOf = (image: IProductImage): string => groupKeyOf(image, axis, shades, volumes)
  const isFull = images.length >= MAX_IMAGES

  const editing = images.find(image => image.id === editingId) ?? null
  const editingIndex = editing === null ? -1 : images.indexOf(editing)

  /* --- Добавление --- */

  const addFiles = (files: File[], tags: IVariantTags): void => {
    const problems: string[] = []
    const accepted: File[] = []

    for (const file of files) {
      const problem = fileProblem(file)

      if (problem === null) {
        accepted.push(file)
      } else {
        problems.push(`${file.name} - ${problem}`)
      }
    }

    const room = MAX_IMAGES - images.length
    const added = accepted.slice(0, room)

    if (accepted.length > room) {
      problems.push(`в галерею помещается ${MAX_IMAGES} фото - лишние не добавлены`)
    }

    setFileError(problems.length === 0 ? null : `Не добавлено: ${problems.join('; ')}`)

    if (added.length > 0) {
      onAdd(
        added.map((file): IProductImageUpload => ({
          file,
          alt: '',
          volumesMl: tags.volumesMl,
          shades: tags.shades,
          hidden: false,
        }))
      )
    }
  }

  const pickFiles = (tags: IVariantTags): void => {
    targetRef.current = tags
    inputRef.current?.click()
  }

  const onDrop = (event: DragEvent<HTMLElement>, group: IGroup): void => {
    event.preventDefault()
    setOverGroup(null)

    if (!isBusy && group.tags !== null && !isFull) {
      addFiles(Array.from(event.dataTransfer.files), group.tags)
    }
  }

  /* --- Порядок --- */

  /** Меняет фото местами с соседом по группе: порядок прочих фото не трогается. */
  const move = (image: IProductImage, step: -1 | 1): void => {
    const group = keyOf(image)
    const index = images.indexOf(image)
    let target = index + step

    while (target >= 0 && target < images.length && keyOf(images[target]) !== group) {
      target += step
    }

    if (target < 0 || target >= images.length) {
      return
    }

    const next = [...images]
    next[index] = images[target]
    next[target] = image
    onChange(renumber(next))
  }

  /* --- Окно фото --- */

  const openEditor = (image: IProductImage): void => {
    const own =
      axis === 'volume' ? liveVolumes(image, volumes).map(String) : liveShades(image, shades)
    const ownVolumes = axis === 'shade' ? liveVolumes(image, volumes) : []

    setEditingId(image.id)
    setIsDraftSubmitted(false)
    setDraft({
      alt: image.alt ?? '',
      scope: image.hidden === true ? 'hidden' : own.length === 0 ? 'all' : 'some',
      picked: own,
      isVolumeLimited: ownVolumes.length > 0,
      volumes: ownVolumes,
      isPrimary: images.indexOf(image) === 0,
    })
  }

  const closeEditor = (): void => {
    setEditingId(null)
    setDraft(null)
  }

  /** Привязка из набранного в окне — как её хранит сервер. */
  const draftTags = (current: IDraft): IVariantTags => {
    if (current.scope === 'hidden') {
      return { volumesMl: [], shades: [], hidden: true }
    }

    const picked = current.scope === 'some' ? current.picked : []

    if (axis === 'volume') {
      return { volumesMl: picked.map(Number), shades: [], hidden: false }
    }

    return {
      volumesMl: current.isVolumeLimited ? current.volumes : [],
      shades: picked,
      hidden: false,
    }
  }

  /** Что не так с набранным, словами; `null` — можно сохранять. */
  const draftProblem = (current: IDraft): string | null => {
    if (current.scope === 'some' && current.picked.length === 0) {
      return axis === 'volume' ? 'Отметьте хотя бы один объём' : 'Отметьте хотя бы один тон'
    }

    if (current.scope !== 'hidden' && current.isVolumeLimited && current.volumes.length === 0) {
      return 'Отметьте хотя бы один объём'
    }

    const tags = draftTags(current)

    return tags.hidden === true || fitsSomeVariant(variants, tags.volumesMl, tags.shades)
      ? null
      : 'Такого варианта нет: ни в одном из отмеченных объёмов нет отмеченных тонов'
  }

  const saveEditor = (): void => {
    if (editing === null || draft === null) {
      return
    }

    setIsDraftSubmitted(true)

    if (draftProblem(draft) !== null) {
      return
    }

    const tags = draftTags(draft)
    const alt = draft.alt.trim()
    const updated: IProductImage = {
      ...editing,
      alt: alt === '' ? null : alt,
      volumesMl: tags.volumesMl,
      shades: tags.shades,
      hidden: tags.hidden ?? false,
    }
    const rest = images.filter(image => image.id !== editing.id)
    const next =
      draft.isPrimary && editingIndex !== 0
        ? [updated, ...rest]
        : images.map(image => (image.id === editing.id ? updated : image))
    const isSame =
      editingIndex === next.indexOf(updated) &&
      updated.alt === editing.alt &&
      updated.hidden === (editing.hidden ?? false) &&
      groupKeyOf(updated, axis, shades, volumes) === keyOf(editing) &&
      liveVolumes(updated, volumes).join() === liveVolumes(editing, volumes).join() &&
      liveShades(updated, shades).join() === liveShades(editing, shades).join()

    if (!isSame) {
      onChange(renumber(next))
    }

    closeEditor()
  }

  /* --- Отрисовка --- */

  /** Подпись под превью: то, чего не видно по группе. */
  const captionOf = (image: IProductImage, group: string): string | null => {
    const parts: string[] = []

    if (group === 'several') {
      parts.push(
        axis === 'volume'
          ? liveVolumes(image, volumes)
              .map(volume => formatVolume(volume) ?? '')
              .join(', ')
          : liveShades(image, shades).join(', ')
      )
    }

    if (axis === 'shade' && group !== 'hidden') {
      const own = liveVolumes(image, volumes)

      if (own.length > 0) {
        parts.push(`только ${own.map(volume => formatVolume(volume) ?? '').join(', ')}`)
      }
    }

    return parts.length === 0 ? null : parts.join(' · ')
  }

  const renderTile = (
    image: IProductImage,
    group: IGroup,
    members: IProductImage[]
  ): ReactElement => {
    const number = images.indexOf(image) + 1
    const position = members.indexOf(image)
    const caption = captionOf(image, group.key)

    return (
      <li key={image.id} className={styles.tile}>
        <button
          type="button"
          className={styles.thumb}
          disabled={isBusy}
          aria-label={`Фото ${number}${image.alt === null ? '' : ` «${image.alt}»`}: настроить`}
          aria-haspopup="dialog"
          onClick={() => {
            openEditor(image)
          }}
        >
          <AppImage
            className={styles.thumbImage}
            image={{ src: image.url, alt: '' }}
            sizes={IMAGE_SIZES}
            fill={true}
          />
          {number === 1 && <span className={styles.primaryMark}>Главное</span>}
          <span className={styles.editMark} aria-hidden={true}>
            <IconPencil className={styles.editIcon} />
          </span>
        </button>

        {/*
          Подпись — под стрелками: над ними она сдвигала стрелки одной плитки
          ниже, чем у соседей.

          Порядок — стрелками, а не перетаскиванием: на телефоне перетаскивание
          спорит с прокруткой, а с клавиатуры его нет вовсе.
        */}
        {members.length > 1 && (
          <div className={styles.tileControls}>
            <IconButton
              icon={<IconChevronLeft />}
              label={`Сдвинуть фото ${number} левее`}
              size="sm"
              variant="ghost"
              disabled={isBusy || position === 0}
              onClick={() => {
                move(image, -1)
              }}
            />
            <IconButton
              icon={<IconChevronRight />}
              label={`Сдвинуть фото ${number} правее`}
              size="sm"
              variant="ghost"
              disabled={isBusy || position === members.length - 1}
              onClick={() => {
                move(image, 1)
              }}
            />
          </div>
        )}

        {caption !== null && (
          <Text as="span" size="xs" tone="muted">
            {caption}
          </Text>
        )}
      </li>
    )
  }

  const renderGroup = (group: IGroup, groupIndex: number): ReactElement | null => {
    const members = images.filter(image => keyOf(image) === group.key)
    const canAdd = group.tags !== null && !isFull

    // Служебные группы — только когда в них что-то есть.
    if (group.tags === null && members.length === 0) {
      return null
    }

    // По номеру, а не по ключу: в ключе тон, а пробел в id ломает `aria-labelledby`.
    const headingId = `${titleId}-group-${groupIndex}`
    const tags = group.tags
    // У группы тона подсказка нужна, только пока она пуста; у прочих — всегда.
    const groupHint = group.key.includes(':') && members.length > 0 ? undefined : group.hint

    return (
      <section
        key={group.key}
        className={clsx(styles.group, overGroup === group.key && styles.groupOver)}
        aria-labelledby={headingId}
        onDragOver={event => {
          if (canAdd && !isBusy) {
            event.preventDefault()
            setOverGroup(group.key)
          }
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOverGroup(null)
          }
        }}
        onDrop={event => {
          onDrop(event, group)
        }}
      >
        <div className={styles.groupHead}>
          <Text as="span" size="sm" weight="semibold">
            <span id={headingId}>{group.title}</span>
          </Text>
          <Text as="span" size="xs" tone="muted">
            {members.length === 0 ? 'нет фото' : `${members.length} фото`}
          </Text>
        </div>

        {groupHint !== undefined && (
          <Text size="xs" tone="secondary">
            {groupHint}
          </Text>
        )}

        <ul className={styles.tiles}>
          {members.map(image => renderTile(image, group, members))}

          {canAdd && tags !== null && (
            <li className={styles.tile}>
              <button
                type="button"
                className={styles.addTile}
                disabled={isBusy}
                aria-label={`Добавить в «${group.title}»`}
                onClick={() => {
                  pickFiles(tags)
                }}
              >
                <IconPlus className={styles.addIcon} />
                <span aria-hidden={true}>Добавить</span>
                <span className={styles.addTarget} aria-hidden={true}>{`в «${group.title}»`}</span>
              </button>
            </li>
          )}
        </ul>
      </section>
    )
  }

  /* --- Предпросмотр --- */

  const options = previewOptions(variants)
  const shown = images.filter(image => image.hidden !== true)
  // Вариант могли убрать, пока он был выбран: тогда — первый.
  const previewValue = Number(previewIndex) < options.length ? previewIndex : '0'
  const previewVariant = options[Number(previewValue)] ?? null
  const previewImages = imagesForVariant(images, previewVariant)

  /* --- Окно фото: поля --- */

  const scopeChoices: Array<{ scope: IScope; label: string }> = [
    {
      scope: 'all',
      label: axis === 'shade' ? 'Все тона' : axis === 'volume' ? 'Все объёмы' : 'Показывать',
    },
    ...(axis === null
      ? []
      : [
          {
            scope: 'some' as const,
            label: axis === 'shade' ? 'Только выбранные тона' : 'Только выбранные объёмы',
          },
        ]),
    { scope: 'hidden', label: 'Скрыть' },
  ]

  const pickable: Array<{ value: string; label: string }> =
    axis === 'volume'
      ? volumes.map(volume => ({ value: String(volume), label: formatVolume(volume) ?? '' }))
      : shades.map(shade => ({ value: shade, label: shade }))

  const draftError = draft !== null && isDraftSubmitted ? draftProblem(draft) : null

  const renderEditor = (): ReactElement | null => {
    if (editing === null || draft === null) {
      return null
    }

    const update = (patch: Partial<IDraft>): void => {
      setDraft({ ...draft, ...patch })
    }

    return (
      <div className={styles.editor}>
        <div className={styles.editorImage}>
          <AppImage
            className={styles.thumbImage}
            image={{ src: editing.url, alt: editing.alt ?? productName }}
            sizes={{ fb: '320px' }}
            fill={true}
          />
        </div>

        <div className={styles.editorFields}>
          <div className={styles.field} role="group" aria-labelledby={`${titleId}-scope`}>
            <Text as="span" size="sm" weight="semibold">
              <span id={`${titleId}-scope`}>Где показывать</span>
            </Text>

            <div className={styles.chips}>
              {scopeChoices.map(choice => (
                <Chip
                  key={choice.scope}
                  label={choice.label}
                  isSelected={draft.scope === choice.scope}
                  onToggle={() => {
                    update({ scope: choice.scope })
                  }}
                />
              ))}
            </div>

            {draft.scope === 'some' && (
              <div className={styles.checks}>
                {pickable.map(item => (
                  <Checkbox
                    key={item.value}
                    label={item.label}
                    checked={draft.picked.some(value => shadeKey(value) === shadeKey(item.value))}
                    onChange={checked => {
                      update({
                        picked: checked
                          ? [...draft.picked, item.value]
                          : draft.picked.filter(value => shadeKey(value) !== shadeKey(item.value)),
                      })
                    }}
                  />
                ))}
              </div>
            )}

            {draft.scope === 'hidden' && (
              <Text size="xs" tone="secondary">
                Покупатели фото не увидят, а здесь оно останется - в группе «Скрытые»
              </Text>
            )}
          </div>

          {/*
            Объём у товара с тонами — второстепенное: два объёма одного тона
            выглядят одинаково. Поэтому он выключен, пока о нём не попросили.
          */}
          {axis === 'shade' && volumes.length > 0 && draft.scope !== 'hidden' && (
            <div className={styles.field}>
              <Switch
                label="Только для некоторых объёмов"
                checked={draft.isVolumeLimited}
                onChange={checked => {
                  update({ isVolumeLimited: checked })
                }}
              />

              {draft.isVolumeLimited && (
                <div className={styles.checks}>
                  {volumes.map(volume => (
                    <Checkbox
                      key={volume}
                      label={formatVolume(volume) ?? String(volume)}
                      checked={draft.volumes.includes(volume)}
                      onChange={checked => {
                        update({
                          volumes: checked
                            ? [...draft.volumes, volume].sort((left, right) => left - right)
                            : draft.volumes.filter(other => other !== volume),
                        })
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {draftError !== null && <Alert tone="danger">{draftError}</Alert>}

          <Input
            label="Описание (alt)"
            value={draft.alt}
            maxLength={ALT_MAX_LENGTH}
            hint="Что на снимке, например «Помада 05 Rose, тюбик открыт». Его читают поисковики и скринридеры"
            onChange={alt => {
              update({ alt })
            }}
          />

          <div className={styles.field}>
            <Switch
              label="Главное фото"
              checked={draft.isPrimary}
              disabled={editingIndex === 0 || draft.scope === 'hidden'}
              onChange={isPrimary => {
                update({ isPrimary })
              }}
            />
            <Text size="xs" tone="secondary">
              {editingIndex === 0
                ? 'Это фото уже главное. Чтобы сменить его, сделайте главным другое'
                : 'Его показывают карточка в каталоге и поиск'}
            </Text>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className={clsx(styles.container, className)} aria-labelledby={titleId}>
      <div className={styles.head}>
        <Heading level={2} size="sm" id={titleId}>
          Фотографии
        </Heading>
        <Text size="sm" tone="secondary">
          {axis === 'shade'
            ? 'Добавляйте фото прямо в группу тона - оно сразу к нему привязано. Нажмите на фото, чтобы поменять тон, описание или скрыть его.'
            : axis === 'volume'
              ? 'Добавляйте фото прямо в группу объёма - оно сразу к нему привязано. Нажмите на фото, чтобы поменять привязку, описание или скрыть его.'
              : 'Первое фото - главное. Нажмите на фото, чтобы поменять описание или скрыть его.'}
        </Text>
        {hint !== undefined && (
          <Text size="sm" tone="muted">
            {hint}
          </Text>
        )}
        <Text size="xs" tone="muted">
          {`JPEG, PNG или WebP, до 15 МБ, можно несколько сразу или перетаскиванием. ${images.length} из ${MAX_IMAGES}.`}
        </Text>
      </div>

      {isFull && (
        <Text size="sm" tone="secondary">
          {`В галерее ${MAX_IMAGES} фото - больше не поместится. Удалите лишнее, чтобы добавить новое.`}
        </Text>
      )}

      {(fileError !== null || (error !== undefined && error !== null)) && (
        <Alert tone="danger">{error ?? fileError}</Alert>
      )}

      {groups.map(renderGroup)}

      {options.length > 1 && (
        <section className={styles.preview} aria-labelledby={`${titleId}-preview`}>
          <Text as="span" size="sm" weight="semibold">
            <span id={`${titleId}-preview`}>Как увидит покупатель</span>
          </Text>

          <Select
            label="Вариант"
            value={previewValue}
            options={options.map((option, index) => ({
              value: String(index),
              label: formatVariant(option.volumeMl, option.shade) ?? 'Без варианта',
            }))}
            onChange={setPreviewIndex}
          />

          {shown.length === 0 ? (
            <Text size="sm" tone="secondary">
              Показать нечего - на странице товара будет заглушка
            </Text>
          ) : (
            <ol className={styles.previewStrip} aria-label="Фото по порядку показа">
              {previewImages.map((image, index) => (
                <li key={image.id} className={styles.previewItem}>
                  <AppImage
                    className={styles.thumbImage}
                    image={{ src: image.url, alt: image.alt ?? productName }}
                    sizes={{ fb: '96px' }}
                    fill={true}
                  />
                  {index === 0 && <span className={styles.primaryMark}>Первое</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <input
        ref={inputRef}
        className={styles.input}
        tabIndex={-1}
        type="file"
        multiple={true}
        accept={IMAGE_TYPES.join(',')}
        aria-label="Выбрать фото"
        onChange={event => {
          addFiles(Array.from(event.target.files ?? []), targetRef.current)
          // Сброс, иначе повторный выбор того же файла не даст `change`.
          event.target.value = ''
        }}
      />

      <Modal
        isOpen={editing !== null}
        title={editing === null ? 'Фото' : `Фото ${editingIndex + 1}`}
        size="md"
        isDismissable={false}
        onClose={closeEditor}
        footer={
          <div className={styles.editorActions}>
            <Button
              variant="danger"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                if (editing !== null) {
                  closeEditor()
                  onDelete(editing)
                }
              }}
            >
              Удалить фото
            </Button>
            <div className={styles.editorActionsEnd}>
              <Button variant="secondary" size="sm" onClick={closeEditor}>
                Отмена
              </Button>
              <Button size="sm" disabled={isBusy} onClick={saveEditor}>
                Сохранить
              </Button>
            </div>
          </div>
        }
      >
        {renderEditor()}
      </Modal>
    </section>
  )
}
