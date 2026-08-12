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
import { slugify } from '../../utils/slug'
import * as styles from './AdminCategoriesPanel.css'

/**
 * Категории: список с правкой по месту и форма добавления.
 *
 * Правка по месту, а не отдельной страницей: у категории три коротких поля,
 * и ради них уводить владельца с экрана и обратно — лишний путь.
 *
 * Порядок в списке задаёт `sortOrder`, но сортирует бэкенд — панель не
 * пересортировывает, иначе после сохранения строка прыгала бы дважды: сразу
 * и ещё раз после ответа.
 */

const DEFAULT_SKELETON_ROWS = 4

const emptyValues: IAdminCategoryValues = { name: '', slug: '', sortOrder: 0 }

const isValid = (values: IAdminCategoryValues): boolean =>
  values.name.trim() !== '' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.slug)

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<IAdminCategoryValues>(emptyValues)
  const [created, setCreated] = useState<IAdminCategoryValues>(emptyValues)
  const [isSlugTouched, setIsSlugTouched] = useState(false)

  const startEditing = (category: ICategory): void => {
    setEditingId(category.id)
    setDraft({ name: category.name, slug: category.slug, sortOrder: category.sortOrder })
  }

  const submitCreate = (event: FormEvent): void => {
    event.preventDefault()

    if (!isValid(created)) {
      return
    }

    onCreate({ ...created, name: created.name.trim() })
    setCreated(emptyValues)
    setIsSlugTouched(false)
  }

  return (
    <div className={clsx(styles.container, className)}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
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
        ) : (
          categories.map(category =>
            editingId === category.id ? (
              <div key={category.id} className={styles.editRow}>
                <Input
                  label="Название"
                  value={draft.name}
                  onChange={next => {
                    setDraft(current => ({ ...current, name: next }))
                  }}
                />
                <Input
                  label="Адрес (slug)"
                  value={draft.slug}
                  onChange={next => {
                    setDraft(current => ({ ...current, slug: next }))
                  }}
                />
                <Input
                  label="Порядок"
                  value={String(draft.sortOrder)}
                  inputMode="numeric"
                  onChange={next => {
                    setDraft(current => ({ ...current, sortOrder: Number(next) || 0 }))
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
                  <span className={styles.slug}>
                    /{category.slug} · порядок {category.sortOrder}
                  </span>
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
            required={true}
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
            required={true}
            onChange={next => {
              setIsSlugTouched(true)
              setCreated(current => ({ ...current, slug: next }))
            }}
          />
          <Input
            label="Порядок"
            value={String(created.sortOrder)}
            inputMode="numeric"
            hint="Меньше — выше в списке."
            onChange={next => {
              setCreated(current => ({ ...current, sortOrder: Number(next) || 0 }))
            }}
          />
        </div>

        <Button type="submit" disabled={!isValid(created)} isLoading={isBusy}>
          Добавить
        </Button>
      </form>
    </div>
  )
}
