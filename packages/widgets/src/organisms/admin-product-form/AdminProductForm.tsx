import clsx from 'clsx'
import { type FC, type FormEvent, useEffect, useId, useMemo, useState } from 'react'
import type {
  IAdminProductFormProps,
  IAdminProductValues,
  IBasicStyling,
  IProductImage,
  ISelectOption,
} from '../../types'
import { IconTrash } from '../../svg/icons'
import { Alert } from '../../atoms/alert'
import { AppImage } from '../../atoms/app-image'
import { Button } from '../../atoms/button'
import { Combobox } from '../../atoms/combobox'
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
 * Карточка товара в админке: поля товара и, у сохранённого, его фотография.
 *
 * Цена вводится в сомах, а наружу уходит в копейках — как её хранит бэкенд.
 * Обратное («введите копейки») переложило бы на владельца арифметику,
 * в которой легко ошибиться на два порядка.
 *
 * Производитель — поле со свободным вводом и подсказками (`brands`), а не
 * список: своей таблицы у брендов нет, новый заводится тем, что его вписали.
 * Регистр при этом не считается: «round lab» при заведённом «Round Lab» —
 * он же, и сохранится под его написанием, иначе бренд разъехался бы надвое
 * и фильтр каталога показывал бы половину его товаров. Поле обязательное:
 * товар без бренда не находится фильтром каталога и выпадает из выдачи, где
 * его ищут именно по производителю.
 *
 * Адрес (slug) при создании подставляется транслитерацией названия, но
 * остаётся редактируемым: как только владелец правит его руками, автоподстановка
 * выключается — иначе она затирала бы правку на каждом нажатии в названии.
 *
 * Фотография у товара одна: загрузка на бэкенде не добавляет её к прежним,
 * а заменяет их. Поэтому тут нет ни «сделать главной», ни отдельной кнопки
 * «заменить» — выбор нового файла и есть замена. `images` остаётся списком:
 * у товаров, заведённых до этого правила, может лежать несколько снимков, и
 * их нужно показать (и дать удалить), а не спрятать.
 *
 * При создании товара фото грузить некуда: у него нет id. Поэтому файл
 * копится в форме и улетает вместе с остальными полями по сабмиту
 * (см. `IAdminProductValues.image`).
 */

/** Столько же, сколько отводит колонка на бэкенде. */
const BRAND_MAX_LENGTH = 255

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
  brands = [],
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
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [price, setPrice] = useState(product === undefined ? '' : priceToInput(product.priceCents))
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  const [inStock, setInStock] = useState(product?.inStock ?? true)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const [imageAlt, setImageAlt] = useState('')
  const mediaTitleId = useId()
  const createMediaTitleId = useId()

  // Фото при создании: грузить некуда, пока у товара нет id, поэтому файл
  // копится локально и уезжает вместе с остальными полями по сабмиту.
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingImageAlt, setPendingImageAlt] = useState('')
  const pendingImagePreview = useMemo(
    () => (pendingImage === null ? null : URL.createObjectURL(pendingImage)),
    [pendingImage]
  )

  useEffect(
    () => () => {
      if (pendingImagePreview !== null) {
        URL.revokeObjectURL(pendingImagePreview)
      }
    },
    [pendingImagePreview]
  )

  const priceCents = parsePrice(price)

  /**
   * Написание бренда, уже принятое в каталоге, если он там есть.
   *
   * Регистр бренд не различает: «round lab» и «Round Lab» — один и тот же
   * производитель, и разъехавшись по регистру он развалил бы фильтр каталога
   * надвое. Бэкенд делает ровно то же самое, но повторить это здесь дешевле,
   * чем объяснять потом, почему сохранилось не то, что набрано.
   */
  const canonicalBrand = (typed: string): string => {
    const trimmed = typed.trim()

    return brands.find(known => known.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
  }

  const errors = {
    name: name.trim() === '' ? 'Укажите название.' : null,
    slug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
      ? null
      : 'Только латиница, цифры и дефис: например, rose-serum.',
    price: priceCents === null ? 'Цена в сомах, например 1250 или 1250.50.' : null,
    brand: brand.trim() === '' ? 'Укажите производителя.' : null,
  }

  const categoryOptions: ISelectOption[] = categories.map(category => ({
    value: category.id,
    label: category.name,
  }))

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setIsSubmitted(true)

    if (
      errors.name !== null ||
      errors.slug !== null ||
      errors.brand !== null ||
      priceCents === null
    ) {
      return
    }

    const values: IAdminProductValues = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      /*
        Ещё раз, хотя это же делает и само поле: сабмит по Enter уходит в том же
        такте, в котором `Combobox` только просит поменять значение, и сюда
        успевает долететь ровно то, что набрано.
      */
      brand: canonicalBrand(brand),
      priceCents,
      categoryId: categoryId === '' ? null : categoryId,
      inStock,
      image: pendingImage === null ? null : { file: pendingImage, alt: pendingImageAlt.trim() },
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

        <Combobox
          label="Производитель"
          value={brand}
          options={brands}
          maxLength={BRAND_MAX_LENGTH}
          required={true}
          placeholder="Начните вводить название"
          hint="Показывается тэгом в каталоге и на странице товара, например Round Lab."
          error={isSubmitted ? errors.brand : null}
          emptyLabel="Такого производителя ещё нет — он заведётся сам."
          onChange={setBrand}
        />

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

      {product === undefined && (
        <section className={styles.mediaPanel} aria-labelledby={createMediaTitleId}>
          <Heading level={2} size="sm" id={createMediaTitleId}>
            Фотография
          </Heading>

          {pendingImage === null ? (
            <FileDropzone
              label="Фото товара"
              accept={IMAGE_TYPES.join(',')}
              allowedTypes={IMAGE_TYPES}
              maxBytes={IMAGE_MAX_BYTES}
              hint="JPEG, PNG или WebP, до 5 МБ. Необязательно — можно добавить и позже."
              buttonLabel="Выбрать фотографию"
              onSelect={setPendingImage}
            />
          ) : (
            <>
              <div className={styles.thumb}>
                {pendingImagePreview !== null && (
                  <AppImage
                    className={styles.thumbImage}
                    image={{ src: pendingImagePreview, alt: pendingImageAlt || name }}
                    sizes={IMAGE_SIZES}
                    fill={true}
                  />
                )}

                <IconButton
                  className={styles.thumbDelete}
                  icon={<IconTrash />}
                  label="Убрать фотографию"
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setPendingImage(null)
                    setPendingImageAlt('')
                  }}
                />
              </div>

              <Input
                label="Описание фотографии (alt)"
                value={pendingImageAlt}
                hint="Что на снимке — необязательно."
                onChange={setPendingImageAlt}
              />
            </>
          )}
        </section>
      )}

      {images !== undefined && onImageUpload !== undefined && onImageDelete !== undefined && (
        <section className={styles.mediaPanel} aria-labelledby={mediaTitleId}>
          <Heading level={2} size="sm" id={mediaTitleId}>
            Фотография
          </Heading>

          {images.length === 0 ? (
            <Text tone="secondary" size="sm">
              Пока без фотографии — в каталоге у товара будет заглушка.
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

          <FileDropzone
            label={images.length === 0 ? 'Фото товара' : 'Другая фотография'}
            accept={IMAGE_TYPES.join(',')}
            allowedTypes={IMAGE_TYPES}
            maxBytes={IMAGE_MAX_BYTES}
            hint={`JPEG, PNG или WebP, до 5 МБ.${
              images.length === 0
                ? ''
                : images.length === 1
                  ? ' Новый файл заменит текущую фотографию.'
                  : ' Новый файл заменит все текущие фотографии.'
            }`}
            error={imageError}
            disabled={isImageBusy}
            buttonLabel="Выбрать фотографию"
            onSelect={file => {
              onImageUpload({ file, alt: imageAlt.trim() })
              setImageAlt('')
            }}
          />
        </section>
      )}
    </div>
  )
}
