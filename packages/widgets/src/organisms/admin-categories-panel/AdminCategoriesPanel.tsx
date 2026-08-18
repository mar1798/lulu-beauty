import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type {
  IAdminCategoriesPanelProps,
  IAdminCategoryValues,
  IBasicStyling,
  ICategory,
} from '../../types'
import { IconCheck, IconClose, IconPencil, IconTrash } from '../../svg/icons'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { SearchField } from '../../molecules/search-field'
import { slugify } from '../../utils/slug'
import * as styles from './AdminCategoriesPanel.css'

/**
 * Категории: список с правкой по месту и форма добавления.
 *
 * Правка по месту, а не отдельной страницей: у категории три коротких поля,
 * и ради них уводить владельца с экрана и обратно — лишний путь.
 *
 * Порядок в списке задаёт `sortOrder`, но задаётся он сам: новая категория
 * встаёт в конец (бэкенд, `CategoryService.create`). Поля для него нет — руками
 * категории никто не переставлял, а обязательное число перед формой из двух
 * полей было единственным, обо что там можно было споткнуться. Сортирует по
 * нему по-прежнему бэкенд: пересортируй панель сама, строка после сохранения
 * прыгала бы дважды — сразу и ещё раз после ответа.
 *
 * Поиск — по загруженному списку, а не запросом: категорий десятки, они уже все
 * здесь, и ходить за подмножеством того, что лежит в памяти, незачем. Ищет и по
 * названию, и по слагу: в импорте категория адресуется именно слагом.
 */

const DEFAULT_SKELETON_ROWS = 4

/** Столько же, сколько отводят колонки на бэкенде (`CategoryCreateRequest`). */
const NAME_MAX_LENGTH = 255
const SLUG_MAX_LENGTH = 255

const emptyValues: IAdminCategoryValues = { name: '', slug: '' }

/** Совпадение по названию или слагу, без учёта регистра и краевых пробелов. */
const matches = (category: ICategory, query: string): boolean => {
  const needle = query.trim().toLowerCase()

  return (
    needle === '' ||
    category.name.toLowerCase().includes(needle) ||
    category.slug.toLowerCase().includes(needle)
  )
}

/**
 * Ошибки полей категории — текстом, а не одним «нельзя сохранить».
 *
 * Раньше негодные значения только гасили кнопку, и в форме из двух полей
 * приходилось догадываться, какое из них не нравится: чаще всего слаг, куда
 * попала кириллица из названия (`slugify` отдаёт её как есть).
 */
const validate = (values: IAdminCategoryValues): Record<'name' | 'slug', string | null> => ({
  name:
    values.name.trim() === ''
      ? 'Укажите название.'
      : values.name.trim().length > NAME_MAX_LENGTH
        ? `Название длиннее ${NAME_MAX_LENGTH} символов.`
        : null,
  slug:
    values.slug.trim() === ''
      ? 'Укажите адрес: например, tonery.'
      : !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.slug)
        ? 'Только латиница, цифры и дефис: например, tonery.'
        : values.slug.length > SLUG_MAX_LENGTH
          ? `Адрес длиннее ${SLUG_MAX_LENGTH} символов.`
          : null,
})

const isValid = (values: IAdminCategoryValues): boolean =>
  Object.values(validate(values)).every(message => message === null)

export const AdminCategoriesPanel: FC<IAdminCategoriesPanelProps & IBasicStyling> = ({
  categories,
  onCreate,
  onUpdate,
  onDelete,
  isLoading = false,
  isBusy = false,
  error,
  className,
}) => {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<IAdminCategoryValues>(emptyValues)
  const [created, setCreated] = useState<IAdminCategoryValues>(emptyValues)
  const [isSlugTouched, setIsSlugTouched] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const createErrors = validate(created)
  const draftErrors = validate(draft)

  const startEditing = (category: ICategory): void => {
    setEditingId(category.id)
    setDraft({ name: category.name, slug: category.slug })
  }

  const submitCreate = (event: FormEvent): void => {
    event.preventDefault()
    setIsSubmitted(true)

    if (!isValid(created)) {
      return
    }

    onCreate({ ...created, name: created.name.trim() })
    setCreated(emptyValues)
    setIsSlugTouched(false)
    setIsSubmitted(false)
  }

  const found = categories.filter(category => matches(category, query))

  return (
    <div className={clsx(styles.container, className)}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )}

      {/*
        Поиск не рисуется, пока список грузится: поле, которому нечего фильтровать,
        только предлагает набрать в пустоту.
      */}
      {!isLoading && categories.length > 0 && (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Поиск по названию или слагу"
        />
      )}

      <div className={styles.list}>
        {isLoading ? (
          Array.from({ length: DEFAULT_SKELETON_ROWS }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={index} height={56} shape="block" />
          ))
        ) : categories.length === 0 ? (
          <Text tone="secondary" size="sm">
            Категорий пока нет. Товары без категории показываются в каталоге как обычно.
          </Text>
        ) : found.length === 0 ? (
          /* Отдельный текст: «категорий нет» и «по запросу ничего» — разные новости. */
          <Text tone="secondary" size="sm">
            {`По запросу «${query.trim()}» ничего не нашлось.`}
          </Text>
        ) : (
          found.map(category =>
            editingId === category.id ? (
              <div key={category.id} className={styles.editRow}>
                {/*
                  Ошибка здесь видна сразу, без ожидания сабмита: строка открылась
                  с уже верными значениями, и всё негодное в ней — то, что человек
                  только что стёр или переписал сам.
                */}
                <Input
                  label="Название"
                  value={draft.name}
                  maxLength={NAME_MAX_LENGTH}
                  required={true}
                  error={draftErrors.name}
                  onChange={next => {
                    setDraft(current => ({ ...current, name: next }))
                  }}
                />
                <Input
                  label="Адрес (slug)"
                  value={draft.slug}
                  maxLength={SLUG_MAX_LENGTH}
                  required={true}
                  error={draftErrors.slug}
                  onChange={next => {
                    setDraft(current => ({ ...current, slug: next }))
                  }}
                />
                <div className={styles.rowActions}>
                  <IconButton
                    icon={<IconCheck />}
                    label="Сохранить категорию"
                    size="sm"
                    variant="solid"
                    disabled={isBusy || !isValid(draft)}
                    onClick={() => {
                      onUpdate(category, { ...draft, name: draft.name.trim() })
                      setEditingId(null)
                    }}
                  />
                  <IconButton
                    icon={<IconClose />}
                    label="Отменить правку"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null)
                    }}
                  />
                </div>
              </div>
            ) : (
              <div key={category.id} className={styles.row}>
                <div className={styles.info}>
                  <span className={styles.name}>{category.name}</span>
                  <span className={styles.slug}>/{category.slug}</span>
                </div>

                <div className={styles.rowActions}>
                  <IconButton
                    icon={<IconPencil />}
                    label={`Изменить «${category.name}»`}
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => {
                      startEditing(category)
                    }}
                  />
                  <IconButton
                    icon={<IconTrash />}
                    label={`Удалить «${category.name}»`}
                    size="sm"
                    variant="danger"
                    disabled={isBusy}
                    onClick={() => {
                      onDelete(category)
                    }}
                  />
                </div>
              </div>
            )
          )
        )}
      </div>

      <form className={styles.createForm} noValidate={true} onSubmit={submitCreate}>
        <Text weight="semibold">Новая категория</Text>

        <div className={styles.createFields}>
          <Input
            label="Название"
            value={created.name}
            maxLength={NAME_MAX_LENGTH}
            required={true}
            error={isSubmitted ? createErrors.name : null}
            onChange={next => {
              setCreated(current => ({
                ...current,
                name: next,
                slug: isSlugTouched ? current.slug : slugify(next),
              }))
            }}
          />
          <Input
            label="Адрес (slug)"
            value={created.slug}
            maxLength={SLUG_MAX_LENGTH}
            required={true}
            hint="Часть ссылки на каталог: /catalog?category=tonery"
            error={isSubmitted ? createErrors.slug : null}
            onChange={next => {
              setIsSlugTouched(true)
              setCreated(current => ({ ...current, slug: next }))
            }}
          />
        </div>

        {/*
          Кнопка живая и при негодных полях: заблокированная не объясняла, чем
          именно недовольна, — теперь нажатие показывает это под самим полем.
        */}
        <Button isFullWidth="mobile" type="submit" isLoading={isBusy}>
          Добавить
        </Button>
      </form>
    </div>
  )
}
