import clsx from 'clsx'
import { type FC, type FormEvent, useId, useState } from 'react'
import type {
  IAdminProductFormProps,
  IAdminProductValues,
  IBasicStyling,
  IProductImage,
  ISelectOption,
} from '../../types'
import { IconStar, IconTrash } from '../../svg/icons'
import { Alert } from '../../atoms/alert'
import { AppImage } from '../../atoms/app-image'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { Checkbox } from '../../atoms/checkbox'
import { Heading } from '../../atoms/heading'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Select } from '../../atoms/select'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { FileDropzone } from '../../molecules/file-dropzone'
import { slugify } from '../../utils/slug'
import * as styles from './AdminProductForm.css'

/**
 * Карточка товара в админке: поля товара и, у сохранённого, его фотографии.
 *
 * Цена вводится в сомах, а наружу уходит в копейках — как её хранит бэкенд.
 * Обратное («введите копейки») переложило бы на владельца арифметику,
 * в которой легко ошибиться на два порядка.
 *
 * Адрес (slug) при создании подставляется транслитерацией названия, но
 * остаётся редактируемым: как только владелец правит его руками, автоподстановка
 * выключается — иначе она затирала бы правку на каждом нажатии в названии.
 *
 * Главную фотографию нельзя переназначить у уже загруженной: у бэкенда есть
 * только загрузка (`isPrimary` в форме) и удаление, ручки «сделать главной»
 * нет. Поэтому флажок стоит рядом с загрузкой, а не у каждой карточки.
 */

const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_SIZES = { fb: '160px' } as const
const CENTS = 100

const priceToInput = (priceCents: number): string =>
  priceCents % CENTS === 0 ? String(priceCents / CENTS) : (priceCents / CENTS).toFixed(2)

/** «1 250,50» и «1250.5» — одно и то же; `null`, если это не число. */
const parsePrice = (value: string): number | null => {
  const normalized = value.replace(/\s/g, '').replace(',', '.')

  if (normalized === '' || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  return Math.round(Number(normalized) * CENTS)
}

export const AdminProductForm: FC<IAdminProductFormProps & IBasicStyling> = ({
  categories,
  product,
  onSubmit,
  isSubmitting = false,
  error,
  images,
  onImageUpload,
  onImageDelete,
  isImageBusy = false,
  imageError,
  footer,
  className,
}) => {
  const [name, setName] = useState(product?.name ?? '')
  const [slug, setSlug] = useState(product?.slug ?? '')
  const [isSlugTouched, setIsSlugTouched] = useState(product !== undefined)
  const [description, setDescription] = useState(product?.description ?? '')
  const [price, setPrice] = useState(product === undefined ? '' : priceToInput(product.priceCents))
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  const [inStock, setInStock] = useState(product?.inStock ?? true)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const [imageAlt, setImageAlt] = useState('')
  const [isNextPrimary, setIsNextPrimary] = useState(false)
  const mediaTitleId = useId()

  const priceCents = parsePrice(price)

  const errors = {
    name: name.trim() === '' ? 'Укажите название.' : null,
    slug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
      ? null
      : 'Только латиница, цифры и дефис: например, rose-serum.',
    price: priceCents === null ? 'Цена в сомах, например 1250 или 1250.50.' : null,
  }

  const categoryOptions: ISelectOption[] = categories.map(category => ({
    value: category.id,
    label: category.name,
  }))

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setIsSubmitted(true)

    if (errors.name !== null || errors.slug !== null || priceCents === null) {
      return
    }

    const values: IAdminProductValues = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      priceCents,
      categoryId: categoryId === '' ? null : categoryId,
      inStock,
    }

    onSubmit(values)
  }

  return (
    <div className={clsx(styles.container, className)}>
      <form className={styles.form} noValidate={true} onSubmit={handleSubmit}>
        {error !== undefined && error !== null && (
          <Alert tone="danger" title="Не получилось сохранить">
            {error}
          </Alert>
        )}

        <Input
          label="Название"
          value={name}
          required={true}
          error={isSubmitted ? errors.name : null}
          onChange={next => {
            setName(next)

            if (!isSlugTouched) {
              setSlug(slugify(next))
            }
          }}
        />

        <Input
          label="Адрес (slug)"
          value={slug}
          required={true}
          hint="Часть ссылки на товар: /catalog/rose-serum"
          error={isSubmitted ? errors.slug : null}
          onChange={next => {
            setIsSlugTouched(true)
            setSlug(next)
          }}
        />

        <div className={styles.row}>
          <Input
            label="Цена, сом"
            value={price}
            inputMode="decimal"
            required={true}
            error={isSubmitted ? errors.price : null}
            onChange={setPrice}
          />

          <Select
            label="Категория"
            value={categoryId}
            options={categoryOptions}
            placeholder="Без категории"
            onChange={setCategoryId}
          />
        </div>

        <Textarea
          label="Описание"
          value={description}
          rows={5}
          maxLength={2000}
          onChange={setDescription}
        />

        <Switch label="В наличии" checked={inStock} onChange={setInStock} />

        <div className={styles.formActions}>
          <Button type="submit" isLoading={isSubmitting}>
            {product === undefined ? 'Создать товар' : 'Сохранить'}
          </Button>
          {footer}
        </div>
      </form>

      {images !== undefined && onImageUpload !== undefined && onImageDelete !== undefined && (
        <section className={styles.mediaPanel} aria-labelledby={mediaTitleId}>
          <Heading level={2} size="sm" id={mediaTitleId}>
            Фотографии
          </Heading>

          {images.length === 0 ? (
            <Text tone="secondary" size="sm">
              Пока ни одной фотографии — в каталоге у товара будет заглушка.
            </Text>
          ) : (
            <ul className={styles.gallery}>
              {images.map((image: IProductImage) => (
                <li key={image.id} className={styles.thumb}>
                  <AppImage
                    className={styles.thumbImage}
                    image={{ src: image.url, alt: image.alt ?? name }}
                    sizes={IMAGE_SIZES}
                    fill={true}
                  />

                  {image.isPrimary && (
                    <Badge className={styles.primaryBadge} tone="brand">
                      <IconStar /> Главная
                    </Badge>
                  )}

                  <IconButton
                    className={styles.thumbDelete}
                    icon={<IconTrash />}
                    label={`Удалить фотографию${image.alt === null ? '' : ` «${image.alt}»`}`}
                    size="sm"
                    variant="danger"
                    disabled={isImageBusy}
                    onClick={() => {
                      onImageDelete(image)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          <Input
            label="Описание фотографии (alt)"
            value={imageAlt}
            hint="Что на снимке — текст читают поисковики и скринридеры."
            onChange={setImageAlt}
          />

          <Checkbox
            label="Сделать главной"
            hint="Главная показывается в каталоге. Метка снимется с остальных."
            checked={isNextPrimary}
            onChange={setIsNextPrimary}
          />

          <FileDropzone
            label="Новая фотография"
            accept={IMAGE_TYPES.join(',')}
            allowedTypes={IMAGE_TYPES}
            maxBytes={IMAGE_MAX_BYTES}
            hint="JPEG, PNG или WebP, до 5 МБ."
            error={imageError}
            disabled={isImageBusy}
            buttonLabel="Выбрать фотографию"
            onSelect={file => {
              onImageUpload({ file, alt: imageAlt.trim(), isPrimary: isNextPrimary })
              setImageAlt('')
              setIsNextPrimary(false)
            }}
          />
        </section>
      )}
    </div>
  )
}
