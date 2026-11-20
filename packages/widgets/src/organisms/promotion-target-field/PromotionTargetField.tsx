import clsx from 'clsx'
import { type FC, useState } from 'react'
import type {
  IBasicStyling,
  IProduct,
  IPromotionTargetFieldProps,
  ISelectOption,
} from '../../types'
import { IconClose, IconPlus } from '../../svg/icons'
import { Button } from '../../atoms/button'
import { Combobox } from '../../atoms/combobox'
import { IconButton } from '../../atoms/icon-button'
import { Select } from '../../atoms/select'
import { categoryOptions } from '../../utils/categories'
import { PromotionProductSearch } from '../promotion-product-search'
import * as styles from './PromotionTargetField.css'

/**
 * Выбор того, к чему относится условие или скидка: товары, категории, бренды.
 *
 * Подходит строка заявки, попавшая под **любой** из трёх списков — подпись так и
 * говорит, иначе «категория и бренд» читалось бы как пересечение. Все три пусты —
 * вся корзина (у условий-«содержит» пустая цель не принимается, это проверяет
 * родитель).
 *
 * Названия выбранных товаров приходят из `catalog.labels`: в акции хранятся
 * только id, а страница дочитывает названия сама. Товар, чьё название
 * неизвестно (удалён из каталога), подписан «Товар удалён» — такая ссылка на
 * чтении просто перестаёт совпадать, а при сохранении сервер её не примет.
 *
 * Бренд вводится полем с подсказками и добавляется кнопкой: у `Combobox` нет
 * «подтверждения», значение меняется на каждый знак.
 */

const UNKNOWN_PRODUCT = 'Товар удалён'

interface ITagProps {
  label: string
  onRemove: () => void
}

const Tag: FC<ITagProps> = ({ label, onRemove }) => (
  <li className={styles.tag}>
    <span className={styles.tagLabel} title={label}>
      {label}
    </span>
    <IconButton
      icon={<IconClose />}
      label={`Убрать: ${label}`}
      size="sm"
      variant="ghost"
      onClick={onRemove}
    />
  </li>
)

export const PromotionTargetField: FC<IPromotionTargetFieldProps & IBasicStyling> = ({
  value,
  onChange,
  catalog,
  legend = 'Что учитывается',
  className,
}) => {
  const [isSearching, setIsSearching] = useState(false)
  const [brandDraft, setBrandDraft] = useState('')

  const categoryNames = new Map(catalog.categories.map(category => [category.id, category.name]))
  const freeCategories: ISelectOption[] = categoryOptions(
    catalog.categories.filter(category => !value.categoryIds.includes(category.id)),
    category => category.id
  )

  const addProduct = (product: IProduct): void => {
    catalog.onLabel(product.id, product.name)

    if (!value.productIds.includes(product.id)) {
      onChange({ ...value, productIds: [...value.productIds, product.id] })
    }
  }

  const addBrand = (): void => {
    const brand = brandDraft.trim()

    if (brand === '') {
      return
    }

    const exists = value.brands.some(known => known.toLowerCase() === brand.toLowerCase())

    if (!exists) {
      onChange({ ...value, brands: [...value.brands, brand] })
    }

    setBrandDraft('')
  }

  return (
    <fieldset className={clsx(styles.container, className)}>
      <legend className={styles.legend}>{legend}</legend>

      <p className={styles.note}>
        Подходит строка заявки, которая попала под любой из списков. Пусто - вся корзина.
      </p>

      <div className={styles.group}>
        <span className={styles.groupTitle}>Товары</span>

        {value.productIds.length > 0 && (
          <ul className={styles.tags}>
            {value.productIds.map(id => (
              <Tag
                key={id}
                label={catalog.labels[id] ?? UNKNOWN_PRODUCT}
                onRemove={() => {
                  onChange({ ...value, productIds: value.productIds.filter(known => known !== id) })
                }}
              />
            ))}
          </ul>
        )}

        {isSearching ? (
          <div className={styles.search}>
            <PromotionProductSearch
              searchProducts={catalog.searchProducts}
              label="Найти товар"
              hint="Выберите любой объём - в цель попадёт товар целиком"
              onPick={addProduct}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsSearching(false)
              }}
            >
              Готово
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            iconStart={<IconPlus />}
            onClick={() => {
              setIsSearching(true)
            }}
          >
            Добавить товар
          </Button>
        )}
      </div>

      <div className={styles.group}>
        <span className={styles.groupTitle}>Категории</span>

        {value.categoryIds.length > 0 && (
          <ul className={styles.tags}>
            {value.categoryIds.map(id => (
              <Tag
                key={id}
                label={categoryNames.get(id) ?? 'Категория удалена'}
                onRemove={() => {
                  onChange({
                    ...value,
                    categoryIds: value.categoryIds.filter(known => known !== id),
                  })
                }}
              />
            ))}
          </ul>
        )}

        <Select
          ariaLabel="Добавить категорию"
          value=""
          options={freeCategories}
          placeholder="Добавить категорию"
          hint="Раздел захватывает и свои подкатегории"
          onChange={id => {
            if (id !== '') {
              onChange({ ...value, categoryIds: [...value.categoryIds, id] })
            }
          }}
        />
      </div>

      <div className={styles.group}>
        <span className={styles.groupTitle}>Бренды</span>

        {value.brands.length > 0 && (
          <ul className={styles.tags}>
            {value.brands.map(brand => (
              <Tag
                key={brand}
                label={brand}
                onRemove={() => {
                  onChange({ ...value, brands: value.brands.filter(known => known !== brand) })
                }}
              />
            ))}
          </ul>
        )}

        <div className={styles.brandRow}>
          <Combobox
            ariaLabel="Бренд"
            value={brandDraft}
            options={catalog.brands}
            maxLength={255}
            placeholder="Название бренда"
            emptyLabel="Такого бренда пока нет в каталоге"
            onChange={setBrandDraft}
          />
          <Button
            variant="secondary"
            size="md"
            disabled={brandDraft.trim() === ''}
            onClick={addBrand}
          >
            Добавить
          </Button>
        </div>
      </div>
    </fieldset>
  )
}
