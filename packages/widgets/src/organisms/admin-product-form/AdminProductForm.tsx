import clsx from 'clsx'
import { type FC, type FormEvent, useEffect, useId, useMemo, useState } from 'react'
import type {
  IAdminProductFormProps,
  IAdminProductValues,
  IAdminProductVariantValues,
  IBasicStyling,
  IProduct,
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
import { FileDropzone } from '../../molecules/file-dropzone'
import { RichTextEditor } from '../../molecules/rich-text-editor'
import { plainTextToHtml, richTextLength } from '../../utils/richText'
import { slugify } from '../../utils/slug'
import * as styles from './AdminProductForm.css'

/**
 * Карточка товара в админке: поля товара и, у сохранённого, его фотография.
 *
 * Цена и объём живут не на товаре, а в таблице «Объёмы»: одна сыворотка
 * продаётся и в 30 мл, и в 50 мл, у каждого своя цена и свой остаток. Строка
 * там всегда хотя бы одна — обычный товар это ровно одна строка, и отдельной
 * «простой» формы для него нет: две формы разошлись бы в проверках.
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

/*
  Пределы полей повторяют схемы бэкенда (`apps/api/app/catalog/schemas.py`,
  `app/common/limits.py`). Держать их здесь — не дублирование ради дублирования:
  без них форма отправляет заведомо отказное и показывает общий текст ответа
  вместо ошибки у того поля, в котором опечатка.
*/

/** Столько же, сколько отводит колонка на бэкенде. */
const BRAND_MAX_LENGTH = 255
const NAME_MAX_LENGTH = 255
const SLUG_MAX_LENGTH = 255

/**
 * `MAX_DESCRIPTION_LENGTH` бэкенда — в видимых символах, без разметки: как
 * считают и счётчик редактора, и сервер.
 */
const DESCRIPTION_MAX_LENGTH = 2000

/** `MAX_VOLUME_ML` бэкенда: пятилитровой косметики не бывает. */
const MAX_VOLUME_ML = 10_000

/** Длина ввода объёма — ровно под потолок: «10000» это пять знаков. */
const VOLUME_MAX_LENGTH = String(MAX_VOLUME_ML).length

/** `MAX_PRICE_CENTS` бэкенда, в сомах: дальше не проходит 32-битная колонка. */
const MAX_PRICE = 20_000_000

/** `MAX_PRODUCT_VARIANTS` бэкенда: столько объёмов у одного товара не бывает. */
const MAX_VARIANTS = 20

/** Потолок `MAX_IMAGE_BYTES` бэкенда. Файл там пережимается в WebP, поэтому лимит
 * стоит на загрузке, а не на том, что окажется на диске. */
const IMAGE_MAX_BYTES = 15 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_SIZES = { fb: '160px' } as const
const CENTS = 100

const priceToInput = (priceCents: number): string =>
  priceCents % CENTS === 0 ? String(priceCents / CENTS) : (priceCents / CENTS).toFixed(2)

/**
 * Объём в миллилитрах: пусто — «не указан», а не ноль. `undefined` — набрано что-то,
 * что объёмом быть не может, и сохранять это нельзя.
 *
 * Число длиннее потолка разбирается как число, а не отбрасывается в `undefined`:
 * «50000» — не «набрано не то», а «столько не бывает», и сказать об этом нужно
 * по-разному.
 */
const parseVolume = (value: string): number | null | undefined => {
  const normalized = value.trim()

  if (normalized === '') {
    return null
  }

  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : undefined
}

/** Знаков после разделителя в цене: копейки, и только они. */
const PRICE_FRACTION_DIGITS = 2

/**
 * Что вообще способно попасть в поле объёма — только цифры.
 *
 * Поле числовое, но не `type="number"`: браузер пускает туда «e», знак и
 * экспоненту, а React на таком вводе получает от него пустую строку и молча
 * стирает уже набранное. Отсекать лишнее на вводе и надёжнее, и заметнее —
 * буква просто не появляется.
 */
const digitsOnly = (value: string): string => value.replace(/\D/g, '')

/**
 * То же для цены, но с дробной частью: один разделитель и не больше двух
 * знаков после него — ровно то, что принимает `parsePrice`. Запятая остаётся
 * запятой: на русской раскладке набирают именно её.
 */
const priceOnly = (value: string): string => {
  const cleaned = value.replace(/[^\d.,]/g, '')
  const separator = cleaned.search(/[.,]/)

  if (separator === -1) {
    return cleaned
  }

  const fraction = cleaned
    .slice(separator + 1)
    .replace(/\D/g, '')
    .slice(0, PRICE_FRACTION_DIGITS)

  return `${cleaned.slice(0, separator)}${cleaned[separator]}${fraction}`
}

/** «1 250,50» и «1250.5» — одно и то же; `null`, если это не число. */
const parsePrice = (value: string): number | null => {
  const normalized = value.replace(/\s/g, '').replace(',', '.')

  if (normalized === '' || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  return Math.round(Number(normalized) * CENTS)
}

/**
 * Строка таблицы «Объёмы» как её держит форма — строками, а не числами.
 *
 * `id` не приходит с бэкенда и туда не уезжает: он нужен только React'у как
 * ключ. Сверять строки с вариантами товара сервер будет по объёму (см.
 * `ProductService._apply_specs`), поэтому переносить сюда настоящий id значило
 * бы намекать на связь, которой в запросе нет.
 */
interface IVariantRow {
  id: string
  volume: string
  price: string
  inStock: boolean
}

let nextRowId = 0
const makeRow = (volume = '', price = '', inStock = true): IVariantRow => {
  nextRowId += 1

  return { id: `variant-${nextRowId}`, volume, price, inStock }
}

/**
 * Объёмы товара строками формы — или одна пустая строка при создании.
 *
 * Пустой таблицы не бывает: у товара всегда есть хотя бы один объём, и форма,
 * начинающаяся с нуля строк, предлагала бы сохранить товар без цены.
 */
const toVariantRows = (product?: IProduct): IVariantRow[] => {
  if (product === undefined || product.variants.length === 0) {
    return [makeRow()]
  }

  return product.variants.map(variant =>
    makeRow(
      variant.volumeMl === null ? '' : String(variant.volumeMl),
      priceToInput(variant.priceCents),
      variant.inStock
    )
  )
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
  /*
    Описание, заведённое до редактора (или импортом), есть только простым
    текстом — редактор получает его абзацами. Сохранение переведёт товар на
    HTML, а текст на бэкенде выведется из него тот же самый.
  */
  const [descriptionHtml, setDescriptionHtml] = useState(
    () => product?.descriptionHtml ?? plainTextToHtml(product?.description ?? '')
  )
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [variants, setVariants] = useState<IVariantRow[]>(() => toVariantRows(product))
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
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

  /*
    Разобранные строки таблицы: пересчитываются на каждый ввод, ровно как
    раньше пересчитывались одиночные поля цены и объёма.
  */
  const parsedVariants = variants.map(row => ({
    volumeMl: parseVolume(row.volume),
    priceCents: parsePrice(row.price),
    inStock: row.inStock,
  }))

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

  /**
   * Тексты ошибок разведены по причинам: пустое поле, набранное не тем и
   * выход за предел — разные новости, и общий на всех текст («например, 50»)
   * на «50000» просто не про то, из-за чего форма не отправилась.
   */
  const validateSlug = (): string | null => {
    if (slug.trim() === '') {
      return 'Укажите адрес: например, rose-serum'
    }

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return 'Только латиница, цифры и дефис: например, rose-serum'
    }

    return slug.length > SLUG_MAX_LENGTH ? `Адрес длиннее ${SLUG_MAX_LENGTH} символов` : null
  }

  const validatePrice = (index: number): string | null => {
    const { priceCents } = parsedVariants[index]

    if (variants[index].price.trim() === '') {
      return 'Укажите цену'
    }

    if (priceCents === null) {
      return 'Цена в сомах, например 1250 или 1250.50'
    }

    return priceCents > MAX_PRICE * CENTS ? 'Цена не больше 20 000 000 сом' : null
  }

  /**
   * Объём проверяется не только сам по себе, но и против строк выше: два
   * одинаковых объёма у одного товара бэкенд отвергает (частичный уникальный
   * индекс), и поймать это здесь дешевле, чем показать потом ответ сервера над
   * всей формой, не указав, какая из строк лишняя.
   */
  const validateVolume = (index: number): string | null => {
    const { volumeMl } = parsedVariants[index]

    if (volumeMl === undefined) {
      return 'Объём в миллилитрах, целым числом: например, 50'
    }

    if (volumeMl !== null && volumeMl > MAX_VOLUME_ML) {
      return 'Объём не больше 10 000 мл'
    }

    const isDuplicate = parsedVariants.some(
      (other, otherIndex) => otherIndex < index && other.volumeMl === volumeMl
    )

    return isDuplicate ? 'Такой объём уже есть выше' : null
  }

  const errors = {
    name:
      name.trim() === ''
        ? 'Укажите название'
        : name.trim().length > NAME_MAX_LENGTH
          ? `Название длиннее ${NAME_MAX_LENGTH} символов`
          : null,
    slug: validateSlug(),
    brand:
      brand.trim() === ''
        ? 'Укажите производителя'
        : brand.trim().length > BRAND_MAX_LENGTH
          ? `Название производителя длиннее ${BRAND_MAX_LENGTH} символов`
          : null,
    description:
      richTextLength(descriptionHtml) > DESCRIPTION_MAX_LENGTH
        ? `Описание длиннее ${DESCRIPTION_MAX_LENGTH} символов`
        : null,
  }

  /*
    Ошибки строк таблицы — своим списком: они рисуются у своих полей, а в общий
    `errors` их не свести, не потеряв, к какой строке какая относится.
  */
  const variantErrors = variants.map((_row, index) => ({
    price: validatePrice(index),
    volume: validateVolume(index),
  }))

  const categoryOptions: ISelectOption[] = categories.map(category => ({
    value: category.id,
    label: category.name,
  }))

  const updateRow = (index: number, patch: Partial<IVariantRow>): void => {
    setVariants(current =>
      current.map((row, other) => (other === index ? { ...row, ...patch } : row))
    )
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setIsSubmitted(true)

    /*
      Одна проверка на всё — тот же `errors`, что рисуется под полями: пока
      сабмит держал свой список условий, поле с ошибкой могло подсветиться,
      а форма всё равно уходила на сервер.
    */
    if (Object.values(errors).some(message => message !== null)) {
      return
    }

    if (variantErrors.some(row => row.price !== null || row.volume !== null)) {
      return
    }

    const submittedVariants: IAdminProductVariantValues[] = []
    for (const row of parsedVariants) {
      // Сюда не дойти с непрошедшими проверками — но их сужение типа нужно ниже.
      if (row.priceCents === null || row.volumeMl === undefined) {
        return
      }
      submittedVariants.push({
        volumeMl: row.volumeMl,
        priceCents: row.priceCents,
        inStock: row.inStock,
      })
    }

    const values: IAdminProductValues = {
      name: name.trim(),
      slug: slug.trim(),
      descriptionHtml,
      /*
        Ещё раз, хотя это же делает и само поле: сабмит по Enter уходит в том же
        такте, в котором `Combobox` только просит поменять значение, и сюда
        успевает долететь ровно то, что набрано.
      */
      brand: canonicalBrand(brand),
      variants: submittedVariants,
      /*
        Те же три правила, по которым бэкенд пересчитывает витринные поля
        (`refresh_display_fields`): минимум, объём только пока он один, наличие
        — «хоть один есть». Последнее слово всё равно за сервером.
      */
      priceCents: Math.min(...submittedVariants.map(variant => variant.priceCents)),
      volumeMl: submittedVariants.length === 1 ? submittedVariants[0].volumeMl : null,
      categoryId: categoryId === '' ? null : categoryId,
      inStock: submittedVariants.some(variant => variant.inStock),
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
          maxLength={NAME_MAX_LENGTH}
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
          maxLength={SLUG_MAX_LENGTH}
          required={true}
          hint="Часть ссылки на товар: /catalog/rose-serum"
          error={isSubmitted ? errors.slug : null}
          onChange={next => {
            setIsSlugTouched(true)
            setSlug(next)
          }}
        />

        <div className={styles.row}>
          <Combobox
            label="Производитель"
            value={brand}
            options={brands}
            maxLength={BRAND_MAX_LENGTH}
            required={true}
            placeholder="Начните вводить название"
            hint="Показывается тэгом в каталоге и на странице товара, например Round Lab"
            error={isSubmitted ? errors.brand : null}
            emptyLabel="Такого производителя ещё нет - он заведётся сам"
            onChange={setBrand}
          />

          <Select
            label="Категория"
            value={categoryId}
            options={categoryOptions}
            placeholder="Без категории"
            hint="Необязательно. По ней товар отбирают в каталоге."
            onChange={setCategoryId}
          />
        </div>

        <fieldset className={styles.variants}>
          {/*
            Легенда, а не заголовок: строки — это группа полей одной формы, и
            скринридер должен объявлять «Объём» вместе с ней, а не отдельным
            разделом страницы.
          */}
          <legend className={styles.variantsLegend}>Объёмы и цены</legend>

          <Text tone="secondary" size="sm">
            Один товар может продаваться в нескольких объёмах - у каждого своя цена и своё наличие.
            Если объём у товара один или его нет вовсе (патчи, тканевые маски), оставьте одну
            строку.
          </Text>

          {variants.map((row, index) => (
            <div key={row.id} className={styles.variantRow}>
              <Input
                label="Объём, мл"
                value={row.volume}
                inputMode="numeric"
                maxLength={VOLUME_MAX_LENGTH}
                hint={index === 0 ? 'Необязательно, до 10 000 мл' : undefined}
                error={isSubmitted ? variantErrors[index].volume : null}
                onChange={next => {
                  updateRow(index, { volume: digitsOnly(next) })
                }}
              />

              <Input
                label="Цена, сом"
                value={row.price}
                inputMode="decimal"
                required={true}
                error={isSubmitted ? variantErrors[index].price : null}
                onChange={next => {
                  updateRow(index, { price: priceOnly(next) })
                }}
              />

              {/*
                Тумблер и «убрать» — одной ячейкой: у них нет подписи сверху,
                и порознь они вставали в сетку по её верхнему краю, то есть на
                уровень подписей соседних полей, а не самих полей. Вместе они
                же держат одну строку и на телефоне, где поля идут столбцом.
              */}
              <div className={styles.variantControls}>
                <Switch
                  label="В наличии"
                  checked={row.inStock}
                  onChange={next => {
                    updateRow(index, { inStock: next })
                  }}
                />

                {/*
                  Убрать можно только когда строк больше одной: товар без объёмов
                  бэкенд отвергает, и кнопка, ведущая в отказ, — не кнопка.
                */}
                {variants.length > 1 && (
                  <IconButton
                    icon={<IconTrash />}
                    label={`Убрать объём${row.volume === '' ? '' : ` ${row.volume} мл`}`}
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setVariants(current => current.filter((_item, other) => other !== index))
                    }}
                  />
                )}
              </div>
            </div>
          ))}

          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={variants.length >= MAX_VARIANTS}
            onClick={() => {
              setVariants(current => [...current, makeRow()])
            }}
          >
            Добавить объём
          </Button>
        </fieldset>

        <RichTextEditor
          label="Описание"
          value={descriptionHtml}
          maxLength={DESCRIPTION_MAX_LENGTH}
          error={isSubmitted ? errors.description : null}
          onChange={setDescriptionHtml}
        />

        <div className={styles.formActions}>
          <Button isFullWidth="mobile" type="submit" isLoading={isSubmitting}>
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
              hint="JPEG, PNG или WebP, до 15 МБ. Необязательно - можно добавить и позже."
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
                hint="Что на снимке - необязательно"
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
              Пока без фотографии - в каталоге у товара будет заглушка
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
            hint="Что на снимке - текст читают поисковики и скринридеры"
            onChange={setImageAlt}
          />

          <FileDropzone
            label={images.length === 0 ? 'Фото товара' : 'Другая фотография'}
            accept={IMAGE_TYPES.join(',')}
            allowedTypes={IMAGE_TYPES}
            maxBytes={IMAGE_MAX_BYTES}
            hint={`JPEG, PNG или WebP, до 15 МБ${
              images.length === 0
                ? ''
                : images.length === 1
                  ? '. Новый файл заменит текущую фотографию.'
                  : '. Новый файл заменит все текущие фотографии.'
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
