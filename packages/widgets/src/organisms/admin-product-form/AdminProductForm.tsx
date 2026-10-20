import clsx from 'clsx'
import { type FC, type FormEvent, useEffect, useRef, useState } from 'react'
import type {
  IAdminProductFormProps,
  IAdminProductValues,
  IAdminProductVariantValues,
  IBasicStyling,
  IProduct,
  IProductImage,
  IProductImageArrangement,
  IProductVariant,
  ISelectOption,
  IVariantTags,
  ShadeLabel,
} from '../../types'
import { IconTrash } from '../../svg/icons'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Combobox } from '../../atoms/combobox'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Select } from '../../atoms/select'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { RichTextEditor } from '../../molecules/rich-text-editor'
import { AdminProductGallery } from '../admin-product-gallery'
import { categoryOptions } from '../../utils/categories'
import { plainTextToHtml, richTextLength } from '../../utils/richText'
import { SHADE_LABEL_FORMS, SHADE_LABELS, shadeLabelForms } from '../../utils/shadeLabel'
import { slugify } from '../../utils/slug'
import { formatVariant, shadeKey } from '../../utils/variants'
import * as styles from './AdminProductForm.css'

/**
 * Карточка товара в админке: поля товара и, у сохранённого, его галерея.
 *
 * Цена, объём и тон живут не на товаре, а в таблице вариантов: одна сыворотка
 * продаётся и в 30 мл, и в 50 мл, одна помада — в «01 Nude» и «05 Rose», а
 * тоналка бывает в обоих объёмах каждого тона. У каждой строки своё наличие;
 * цена — своя у объёма и общая у его тонов (это проверяет и форма, и сервер).
 * Строка там всегда хотя бы одна — обычный товар это ровно одна строка, и
 * отдельной «простой» формы для него нет: две формы разошлись бы в проверках.
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
 * Фото у товара — галерея, разложенная по тонам (`AdminProductGallery`):
 * фото, добавленное в группу тона, к нему и привязано. У сохранённого товара
 * каждая правка галереи сохраняется сразу, всей галереей (`onImagesArrange`),
 * а группы строятся по сохранённым вариантам — привязку к несохранённому
 * сервер не примет.
 *
 * При создании товара фото грузить некуда: у него нет id. Поэтому файлы
 * копятся в форме вместе с привязками — группы там строятся по набранным
 * строкам вариантов — и улетают вместе с остальными полями по сабмиту
 * (см. `IAdminProductValues.images`).
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

/** `MAX_PRODUCT_VARIANTS` бэкенда: все объёмы на все тона. */
const MAX_VARIANTS = 100

/** `MAX_SHADE_LENGTH` бэкенда. */
const SHADE_MAX_LENGTH = 64

/** Варианты, к которым можно привязать фото, — без повторов и без недописанных строк. */
type IGalleryVariant = Pick<IProductVariant, 'volumeMl' | 'shade'>

/**
 * Привязка фото, которую сервер примет у этих вариантов: метки, которых у
 * товара больше нет, отбрасываются, а объёмы, не сошедшиеся с тонами, — тоже,
 * как это делает и сервер при правке вариантов. Тон мог исчезнуть, пока фото
 * ждало создания товара: его переименовали в строке вариантов.
 */
const liveImageTags = (variants: IGalleryVariant[], image: IProductImage): IVariantTags => {
  if (image.hidden === true) {
    return { volumesMl: [], shades: [], hidden: true }
  }

  const volumes = (image.volumesMl ?? []).filter(volume =>
    variants.some(variant => variant.volumeMl === volume)
  )
  const shades = (image.shades ?? []).filter(shade =>
    variants.some(variant => shadeKey(variant.shade) === shadeKey(shade))
  )
  const fits = variants.some(
    variant =>
      (volumes.length === 0 || (variant.volumeMl !== null && volumes.includes(variant.volumeMl))) &&
      (shades.length === 0 || shades.some(shade => shadeKey(shade) === shadeKey(variant.shade)))
  )

  return { volumesMl: fits ? volumes : [], shades, hidden: false }
}

/** Галерея — в тот вид, в котором её сохраняет сервер. */
const toArrangement = (images: IProductImage[]): IProductImageArrangement[] =>
  images.map(image => ({
    id: image.id,
    volumesMl: image.hidden === true ? [] : (image.volumesMl ?? []),
    shades: image.hidden === true ? [] : (image.shades ?? []),
    hidden: image.hidden ?? false,
    alt: image.alt,
  }))

/** Фото, ждущее создания товара: файл и то, как его покажет галерея. */
interface IPendingImage {
  image: IProductImage
  file: File
}

let nextPendingId = 0

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
 * Строка таблицы вариантов как её держит форма — строками, а не числами.
 *
 * `id` — ключ для React, у новой строки своего варианта нет. `variantId` —
 * вариант, из которого строка загружена: он уезжает на сервер, и по нему
 * сервер узнаёт строку, у которой поправили тон (см.
 * `ProductService._apply_specs`). Без него исправление опечатки в тоне
 * снимало бы старый тон из всех корзин и заявок. Объём так не правится:
 * строка с другим объёмом — новый вариант, а прежний снимается, потому что
 * 30 и 50 мл — разные товары по разной цене, а не опечатка.
 */
interface IVariantRow {
  id: string
  variantId: string | null
  volume: string
  shade: string
  price: string
  inStock: boolean
}

let nextRowId = 0
const makeRow = (patch: Partial<Omit<IVariantRow, 'id'>> = {}): IVariantRow => {
  nextRowId += 1

  return {
    id: `variant-${nextRowId}`,
    variantId: null,
    volume: '',
    shade: '',
    price: '',
    inStock: true,
    ...patch,
  }
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
    makeRow({
      variantId: variant.id,
      volume: variant.volumeMl === null ? '' : String(variant.volumeMl),
      shade: variant.shade ?? '',
      price: priceToInput(variant.priceCents),
      inStock: variant.inStock,
    })
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
  onImagesUpload,
  onImageDelete,
  onImagesArrange,
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
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false)
  const [shadeLabel, setShadeLabel] = useState<ShadeLabel>(product?.shadeLabel ?? 'TONE')
  /* Слово, которым товар называет тона, во всех нужных падежах: «Цвет», «цветов». */
  const shadeForms = shadeLabelForms(shadeLabel)
  const [isSubmitted, setIsSubmitted] = useState(false)

  /*
    Неудачный сабмит — фокус и прокрутка к первому полю с ошибкой. Форма длинная,
    и на телефоне после «Сохранить» спиннер мигал, а ошибка оставалась на два-три
    экрана выше: казалось, что ничего не происходит. Счётчик, а не флаг: второй
    неудачный сабмит подряд обязан сработать так же.
  */
  const formRef = useRef<HTMLFormElement>(null)
  const [invalidSubmits, setInvalidSubmits] = useState(0)

  useEffect(() => {
    if (invalidSubmits === 0) {
      return
    }

    const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')

    field?.scrollIntoView({ block: 'center' })
    field?.focus({ preventScroll: true })
  }, [invalidSubmits])

  /*
    Фото при создании: грузить некуда, пока у товара нет id, поэтому файлы
    копятся здесь вместе с привязками и уезжают с остальными полями по сабмиту.
    Превью — object URL файла; он освобождается, когда фото убирают, и при
    уходе со страницы.
  */
  const [pendingImages, setPendingImages] = useState<IPendingImage[]>([])
  const previewUrls = useRef(new Set<string>())

  useEffect(() => {
    const urls = previewUrls.current

    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url)
      }
    }
  }, [])

  /*
    Разобранные строки таблицы: пересчитываются на каждый ввод, ровно как
    раньше пересчитывались одиночные поля цены и объёма.
  */
  const parsedVariants = variants.map(row => ({
    id: row.variantId,
    volumeMl: parseVolume(row.volume),
    shade: row.shade.split(/\s+/).filter(Boolean).join(' ') || null,
    priceCents: parsePrice(row.price),
    inStock: row.inStock,
  }))
  /* Тон есть хоть у одной строки — значит, он нужен всем. */
  const hasShades = parsedVariants.some(row => row.shade !== null)

  /*
    Варианты, по которым галерея нового товара строит группы: набранные строки,
    у которых объём разобрался. У сохранённого товара — его сохранённые
    варианты: к ним сервер и сверяет привязку.
  */
  const typedVariants: IGalleryVariant[] = parsedVariants.flatMap(row =>
    row.volumeMl === undefined ? [] : [{ volumeMl: row.volumeMl, shade: row.shade }]
  )
  const variantKey = (variant: IGalleryVariant): string =>
    `${variant.volumeMl ?? ''}|${shadeKey(variant.shade) ?? ''}`
  const savedKeys = new Set((product?.variants ?? []).map(variantKey))
  const hasUnsavedVariants =
    product !== undefined && typedVariants.some(variant => !savedKeys.has(variantKey(variant)))

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

    if (priceCents > MAX_PRICE * CENTS) {
      return 'Цена не больше 20 000 000 сом'
    }

    /*
      Тона одного объёма стоят одинаково — так считает и сервер. Ошибка у
      нижней строки: верхняя задала цену объёму, нижняя с ней разошлась.
    */
    const { volumeMl } = parsedVariants[index]
    const differs = parsedVariants.some(
      (other, otherIndex) =>
        otherIndex < index &&
        other.volumeMl === volumeMl &&
        other.priceCents !== null &&
        other.priceCents !== priceCents
    )

    return differs
      ? `У ${shadeForms.genitivePlural} одного объёма цена одна - как в строке выше`
      : null
  }

  /** Тон: длина, и либо у всех строк, либо ни у одной. */
  const validateShade = (index: number): string | null => {
    const { shade } = parsedVariants[index]

    if (shade === null) {
      return hasShades ? `Укажите ${shadeForms.accusative} - у других строк он есть` : null
    }

    return shade.length > SHADE_MAX_LENGTH
      ? `${shadeForms.title} длиннее ${SHADE_MAX_LENGTH} символов`
      : null
  }

  /**
   * Объём проверяется не только сам по себе, но и против строк выше: два
   * одинаковых варианта (объём и тон) у одного товара бэкенд отвергает
   * (частичный уникальный индекс), и поймать это здесь дешевле, чем показать
   * потом ответ сервера над всей формой, не указав, какая из строк лишняя.
   */
  const validateVolume = (index: number): string | null => {
    const { volumeMl } = parsedVariants[index]

    if (volumeMl === undefined) {
      return 'Объём в миллилитрах, целым числом: например, 50'
    }

    if (volumeMl !== null && volumeMl > MAX_VOLUME_ML) {
      return 'Объём не больше 10 000 мл'
    }

    const key = shadeKey(parsedVariants[index].shade)
    const isDuplicate = parsedVariants.some(
      (other, otherIndex) =>
        otherIndex < index && other.volumeMl === volumeMl && shadeKey(other.shade) === key
    )

    if (!isDuplicate) {
      return null
    }

    return hasShades
      ? `Такой объём с этим ${shadeForms.instrumental} уже есть выше`
      : 'Такой объём уже есть выше'
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
    shade: validateShade(index),
  }))

  const shadeLabelOptions: ISelectOption[] = SHADE_LABELS.map(label => ({
    value: label,
    label: SHADE_LABEL_FORMS[label].title,
  }))

  // Деревом, как в фильтрах: подкатегория под своим разделом.
  const categorySelectOptions: ISelectOption[] = categoryOptions(
    categories,
    category => category.id
  )

  /** Подпись кнопки «убрать» — с тем, что убирается: строк одного товара бывает сорок. */
  const removeLabel = (index: number): string => {
    const { volumeMl, shade } = parsedVariants[index]
    const label = formatVariant(volumeMl ?? null, shade)

    return label === null ? 'Убрать вариант' : `Убрать вариант ${label}`
  }

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
      setInvalidSubmits(current => current + 1)
      return
    }

    if (
      variantErrors.some(row => row.price !== null || row.volume !== null || row.shade !== null)
    ) {
      setInvalidSubmits(current => current + 1)
      return
    }

    const submittedVariants: IAdminProductVariantValues[] = []
    for (const row of parsedVariants) {
      // Сюда не дойти с непрошедшими проверками — но их сужение типа нужно ниже.
      if (row.priceCents === null || row.volumeMl === undefined) {
        return
      }
      submittedVariants.push({
        id: row.id,
        volumeMl: row.volumeMl,
        shade: row.shade,
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
      isFeatured,
      shadeLabel,
      images: pendingImages.map(({ image, file }) => {
        const tags = liveImageTags(typedVariants, image)

        return {
          file,
          alt: image.alt ?? '',
          volumesMl: tags.volumesMl,
          shades: tags.shades,
          hidden: tags.hidden ?? false,
        }
      }),
    }

    onSubmit(values)
  }

  return (
    <div className={clsx(styles.container, className)}>
      <form ref={formRef} className={styles.form} noValidate={true} onSubmit={handleSubmit}>
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
            options={categorySelectOptions}
            placeholder="Без категории"
            hint="Необязательно. По ней товар отбирают в каталоге."
            onChange={setCategoryId}
          />
        </div>

        {/*
          Лимит в подсказке, а не только в ошибке: владелец узнаёт о нём до
          того, как упрётся, — и понимает, почему четвёртый товар не встал.
        */}
        <div className={styles.featured}>
          <Switch label="Показывать на главной" checked={isFeatured} onChange={setIsFeatured} />

          <Text tone="secondary" size="sm">
            Карточка встанет рядом с заголовком главной. Таких товаров не больше трёх.
          </Text>
        </div>

        <fieldset className={styles.variants}>
          {/*
            Легенда, а не заголовок: строки — это группа полей одной формы, и
            скринридер должен объявлять «Объём» вместе с ней, а не отдельным
            разделом страницы.
          */}
          <legend className={styles.variantsLegend}>Варианты и цены</legend>

          <Text tone="secondary" size="sm">
            Товар может продаваться в нескольких объёмах и тонах - строка на каждый вариант, у
            каждого своё наличие. Цена своя у объёма и одна у всех его тонов. Если вариант у товара
            один (патчи, тканевые маски), оставьте одну строку, а тон - пустым.
          </Text>

          {/*
            Не у каждого товара «тон»: у помады это цвет, у парфюма аромат.
            Слово уходит в подпись колонки ниже и в ряд выбора на странице товара.
          */}
          <Select
            className={styles.shadeLabel}
            label="Как называть тона"
            value={shadeLabel}
            options={shadeLabelOptions}
            hint="Так ряд выбора будет подписан на странице товара"
            onChange={next => {
              setShadeLabel(next as ShadeLabel)
            }}
          />

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
                label={shadeForms.title}
                value={row.shade}
                maxLength={SHADE_MAX_LENGTH}
                hint={index === 0 ? 'Необязательно, например 05 Rose' : undefined}
                error={isSubmitted ? variantErrors[index].shade : null}
                onChange={next => {
                  updateRow(index, { shade: next })
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
                Тумблер и «убрать» — одной полкой под полями строки: четвёртой
                колонкой они сжимали поле объёма до переноса подписи.
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
                    label={removeLabel(index)}
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
              /*
                У товара с тонами новая строка — копия объёма и цены последней:
                тона одного объёма идут подряд и стоят одинаково, и вбивать одно
                и то же десять раз — не работа, а повод опечататься. Без тонов
                строка пустая: следующий вариант там — другой объём, и копия
                сразу была бы дублем.
              */
              setVariants(current => {
                const last = current[current.length - 1]
                const isShaded = current.some(row => row.shade.trim() !== '')

                return [
                  ...current,
                  makeRow(
                    last === undefined || !isShaded
                      ? {}
                      : { volume: last.volume, price: last.price }
                  ),
                ]
              })
            }}
          >
            Добавить вариант
          </Button>
        </fieldset>

        <RichTextEditor
          label="Описание"
          value={descriptionHtml}
          maxLength={DESCRIPTION_MAX_LENGTH}
          error={isSubmitted ? errors.description : null}
          onChange={setDescriptionHtml}
        />

        {/*
          Ошибка сервера — у кнопки, а не над формой: на телефоне верх формы в
          этот момент за краем экрана.
        */}
        {error !== undefined && error !== null && (
          <Alert tone="danger" title="Не получилось сохранить">
            {error}
          </Alert>
        )}

        <div className={styles.formActions}>
          <Button isFullWidth="mobile" type="submit" isLoading={isSubmitting}>
            {product === undefined ? 'Создать товар' : 'Сохранить'}
          </Button>
          {footer}
        </div>
      </form>

      {product === undefined && (
        <AdminProductGallery
          className={styles.mediaPanel}
          images={pendingImages.map(({ image }) => image)}
          variants={typedVariants}
          shadeLabel={shadeLabel}
          productName={name}
          isBusy={isSubmitting}
          hint="Фото загрузятся вместе с товаром. Тона и объёмы берутся из таблицы вариантов."
          onChange={next => {
            setPendingImages(current =>
              next.flatMap(image => {
                const file = current.find(item => item.image.id === image.id)?.file

                return file === undefined ? [] : [{ image, file }]
              })
            )
          }}
          onAdd={uploads => {
            // Вне апдейтера: в StrictMode он вызывается дважды, а URL и id нужны по одному.
            const start = pendingImages.length
            const added = uploads.map((upload, index): IPendingImage => {
              const url = URL.createObjectURL(upload.file)
              previewUrls.current.add(url)
              nextPendingId += 1

              return {
                file: upload.file,
                image: {
                  id: `pending-${nextPendingId}`,
                  url,
                  alt: null,
                  sortOrder: start + index,
                  isPrimary: start + index === 0,
                  volumesMl: upload.volumesMl,
                  shades: upload.shades,
                  hidden: upload.hidden,
                },
              }
            })

            setPendingImages(current => [...current, ...added])
          }}
          onDelete={removed => {
            URL.revokeObjectURL(removed.url)
            previewUrls.current.delete(removed.url)
            setPendingImages(current =>
              current
                .filter(item => item.image.id !== removed.id)
                .map((item, index) => ({
                  ...item,
                  image: { ...item.image, sortOrder: index, isPrimary: index === 0 },
                }))
            )
          }}
        />
      )}

      {product !== undefined &&
        images !== undefined &&
        onImagesUpload !== undefined &&
        onImageDelete !== undefined && (
          <AdminProductGallery
            className={styles.mediaPanel}
            images={images}
            variants={product.variants}
            shadeLabel={shadeLabel}
            productName={name}
            isBusy={isImageBusy}
            error={imageError}
            hint={
              hasUnsavedVariants
                ? `Новые ${shadeForms.plural} и объёмы появятся здесь после «Сохранить»`
                : undefined
            }
            onChange={next => {
              onImagesArrange?.(toArrangement(next))
            }}
            onAdd={onImagesUpload}
            onDelete={onImageDelete}
          />
        )}
    </div>
  )
}
