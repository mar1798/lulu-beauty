import clsx from 'clsx'
import { type FC, useState } from 'react'
import type {
  IBasicStyling,
  IPromotionCatalog,
  IPromotionRewardBuilderProps,
  IPromotionRewardDraft,
  ISelectOption,
  PromotionGiftKind,
  PromotionRewardType,
} from '../../types'
import { IconPlus, IconTrash } from '../../svg/icons'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Select } from '../../atoms/select'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { FileDropzone } from '../../molecules/file-dropzone'
import { priceOnly } from '../../utils/priceInput'
import {
  BANNER_ALLOWED_TYPES,
  BANNER_MAX_BYTES,
  DEFAULT_GIFT_TITLE,
  MAX_GIFT_QUANTITY,
  MAX_PROMOTION_REWARDS,
  describePromoCodeDraft,
  newRewardDraft,
} from '../../utils/promotion'
import { formatVariant } from '../../utils/variants'
import { PromotionProductSearch } from '../promotion-product-search'
import { PromotionTargetField } from '../promotion-target-field'
import * as styles from './PromotionRewardBuilder.css'

/**
 * Награды акции: список строк «тип → поля».
 *
 * Скидка — процентом или суммой, на всю корзину или на выбранные товары.
 * Подарок — свободный (название и картинка, по умолчанию «Mystery box»:
 * содержимое покупатель не видит) или товар из каталога, вариант бесплатно.
 * Промокод — настройки в отдельном окне (`AdminPromoCodeDialog`): они вложенные
 * и в строку не помещаются; здесь только кнопка «Настроить». Тот же компонент
 * строит награды самого промокода — там `allowPromoCode={false}`.
 *
 * Картинку свободного подарка грузит страница (`catalog.uploadGiftImage`):
 * акция может быть ещё не сохранена, поэтому адрес из хранилища кладётся в
 * строку и уходит в награду при сохранении.
 */

const REWARD_TYPE_OPTIONS = (allowPromoCode: boolean, hasPromoCode: boolean): ISelectOption[] => [
  { value: 'DISCOUNT', label: 'Скидка' },
  { value: 'GIFT', label: 'Подарок' },
  ...(allowPromoCode
    ? [
        {
          value: 'PROMO_CODE',
          label: hasPromoCode ? 'Промокод (уже есть в акции)' : 'Промокод',
          disabled: hasPromoCode,
        },
      ]
    : []),
]

const KIND_OPTIONS: ISelectOption[] = [
  { value: 'PERCENT', label: 'Процент' },
  { value: 'AMOUNT', label: 'Сумма, сом' },
]

const GIFT_OPTIONS: ISelectOption[] = [
  { value: 'CUSTOM', label: 'Свободный подарок' },
  { value: 'PRODUCT', label: 'Товар из каталога' },
]

const PERCENT_MAX_LENGTH = 3
const QUANTITY_MAX_LENGTH = String(MAX_GIFT_QUANTITY).length

const digitsOnly = (value: string): string => value.replace(/\D/g, '')

interface IGiftImageFieldProps {
  url: string | null
  catalog: IPromotionCatalog
  onChange: (url: string | null) => void
}

/** Картинка свободного подарка: превью, замена, снятие. Загрузка — через `catalog`. */
const GiftImageField: FC<IGiftImageFieldProps> = ({ url, catalog, onChange }) => {
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = (file: File): void => {
    setIsBusy(true)
    setError(null)

    catalog
      .uploadGiftImage(file)
      .then(onChange)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить картинку')
      })
      .finally(() => {
        setIsBusy(false)
      })
  }

  return (
    <div className={styles.giftImage}>
      {url !== null && (
        <div className={styles.giftPreview}>
          {/* Обычный `<img>`: адрес из нашего хранилища, оптимизатор тут ни к чему. */}
          <img className={styles.giftPreviewImage} src={url} alt="Картинка подарка" />
        </div>
      )}

      <FileDropzone
        accept={BANNER_ALLOWED_TYPES.join(',')}
        allowedTypes={BANNER_ALLOWED_TYPES}
        maxBytes={BANNER_MAX_BYTES}
        label="Картинка подарка"
        hint="Необязательно: без неё на сайте будет заглушка. JPG, PNG или WebP, до 15 МБ"
        buttonLabel={url === null ? 'Выбрать файл' : 'Заменить'}
        disabled={isBusy}
        error={error}
        onSelect={upload}
      />

      {url !== null && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isBusy}
          onClick={() => {
            onChange(null)
          }}
        >
          Убрать картинку
        </Button>
      )}
    </div>
  )
}

export const PromotionRewardBuilder: FC<IPromotionRewardBuilderProps & IBasicStyling> = ({
  value,
  onChange,
  catalog,
  errors = {},
  allowPromoCode = true,
  maxRows = MAX_PROMOTION_REWARDS,
  onEditPromoCode,
  className,
}) => {
  const hasPromoCode = value.some(row => row.type === 'PROMO_CODE')

  const update = (key: string, patch: Partial<IPromotionRewardDraft>): void => {
    onChange(value.map(row => (row.key === key ? { ...row, ...patch } : row)))
  }

  const changeType = (row: IPromotionRewardDraft, type: PromotionRewardType): void => {
    if (type === row.type) {
      return
    }

    // Строка пересоздаётся под новый тип, но ключ сохраняется: фокус и ошибки не прыгают.
    onChange(
      value.map(item => (item.key === row.key ? { ...newRewardDraft(type), key: row.key } : item))
    )
  }

  const changeGift = (row: IPromotionRewardDraft, gift: PromotionGiftKind): void => {
    update(row.key, {
      gift,
      giftTitle: gift === 'CUSTOM' ? DEFAULT_GIFT_TITLE : '',
      giftImageUrl: null,
      giftVariantId: null,
    })
  }

  return (
    <div className={clsx(styles.container, className)}>
      {value.length === 0 && (
        <Text size="sm" tone="muted">
          Наград пока нет - добавьте скидку, подарок или промокод.
        </Text>
      )}

      {value.map((row, index) => {
        const error = errors[row.key]

        return (
          <div
            key={row.key}
            className={styles.row}
            role="group"
            aria-label={`Награда ${index + 1}`}
          >
            <div className={styles.rowHead}>
              <span className={styles.rowTitle}>Награда {index + 1}</span>

              <IconButton
                icon={<IconTrash />}
                label={`Удалить награду ${index + 1}`}
                size="md"
                variant="danger"
                onClick={() => {
                  onChange(value.filter(item => item.key !== row.key))
                }}
              />
            </div>

            <div className={styles.fields}>
              <Select
                label="Тип"
                value={row.type}
                options={REWARD_TYPE_OPTIONS(
                  allowPromoCode,
                  hasPromoCode && row.type !== 'PROMO_CODE'
                )}
                onChange={next => {
                  changeType(row, next as PromotionRewardType)
                }}
              />

              {row.type === 'DISCOUNT' && (
                <>
                  <Select
                    label="Вид скидки"
                    value={row.kind}
                    options={KIND_OPTIONS}
                    onChange={next => {
                      update(row.key, { kind: next === 'AMOUNT' ? 'AMOUNT' : 'PERCENT', value: '' })
                    }}
                  />

                  <Input
                    label={row.kind === 'PERCENT' ? 'Процент' : 'Сумма скидки, сом'}
                    value={row.value}
                    inputMode={row.kind === 'PERCENT' ? 'numeric' : 'decimal'}
                    maxLength={row.kind === 'PERCENT' ? PERCENT_MAX_LENGTH : undefined}
                    required={true}
                    error={error ?? null}
                    onChange={next => {
                      update(row.key, {
                        value: row.kind === 'PERCENT' ? digitsOnly(next) : priceOnly(next),
                      })
                    }}
                  />
                </>
              )}

              {row.type === 'GIFT' && (
                <>
                  <Select
                    label="Вид подарка"
                    value={row.gift}
                    options={GIFT_OPTIONS}
                    onChange={next => {
                      changeGift(row, next === 'PRODUCT' ? 'PRODUCT' : 'CUSTOM')
                    }}
                  />

                  <Input
                    label="Сколько штук"
                    value={row.giftQuantity}
                    inputMode="numeric"
                    maxLength={QUANTITY_MAX_LENGTH}
                    required={true}
                    onChange={next => {
                      update(row.key, { giftQuantity: digitsOnly(next) })
                    }}
                  />
                </>
              )}
            </div>

            {row.type === 'DISCOUNT' && (
              <>
                <Switch
                  label="Только на выбранные товары"
                  checked={row.hasTarget}
                  onChange={next => {
                    update(row.key, { hasTarget: next })
                  }}
                />

                {row.hasTarget ? (
                  <PromotionTargetField
                    legend="На что скидка"
                    value={row.target}
                    catalog={catalog}
                    onChange={target => {
                      update(row.key, { target })
                    }}
                  />
                ) : (
                  <Text size="sm" tone="muted">
                    Скидка применится ко всей корзине.
                  </Text>
                )}
              </>
            )}

            {row.type === 'GIFT' && row.gift === 'CUSTOM' && (
              <>
                <Input
                  label="Название подарка"
                  value={row.giftTitle}
                  maxLength={255}
                  hint="Покупатель видит только название и картинку. Пусто - «Mystery box»."
                  onChange={next => {
                    update(row.key, { giftTitle: next })
                  }}
                />

                <GiftImageField
                  url={row.giftImageUrl}
                  catalog={catalog}
                  onChange={url => {
                    update(row.key, { giftImageUrl: url })
                  }}
                />
              </>
            )}

            {row.type === 'GIFT' && row.gift === 'PRODUCT' && (
              <div className={styles.giftProduct}>
                <Text size="sm" weight="medium">
                  {row.giftVariantId === null
                    ? 'Товар не выбран'
                    : `Подарок: ${catalog.labels[row.giftVariantId] ?? row.giftTitle}`}
                </Text>

                <PromotionProductSearch
                  searchProducts={catalog.searchProducts}
                  label="Найти товар-подарок"
                  hint="Подарком уйдёт выбранный объём или тон, бесплатно"
                  pickedVariantIds={row.giftVariantId === null ? [] : [row.giftVariantId]}
                  onPick={(product, variantId) => {
                    const variant = product.variants.find(candidate => candidate.id === variantId)
                    const suffix =
                      variant === undefined || product.variants.length < 2
                        ? null
                        : formatVariant(variant.volumeMl, variant.shade)
                    const label = suffix === null ? product.name : `${product.name}, ${suffix}`

                    catalog.onLabel(variantId, label)
                    update(row.key, { giftVariantId: variantId, giftTitle: label })
                  }}
                />
              </div>
            )}

            {row.type === 'PROMO_CODE' && (
              <div className={styles.promoCode}>
                <Text size="sm" tone="secondary">
                  Персональный одноразовый код. Выдаётся покупателю после оплаты заявки: срок,
                  условия и то, что он даёт, настраиваются отдельно.
                </Text>

                <Text
                  size="sm"
                  weight="medium"
                  tone={describePromoCodeDraft(row.promoCode) === null ? 'muted' : 'primary'}
                >
                  {describePromoCodeDraft(row.promoCode) ?? 'Ещё не настроен'}
                </Text>

                {onEditPromoCode !== undefined && (
                  <Button
                    variant="secondary"
                    isFullWidth="mobile"
                    onClick={() => {
                      onEditPromoCode(row.key)
                    }}
                  >
                    Настроить промокод
                  </Button>
                )}
              </div>
            )}

            {error !== undefined && row.type !== 'DISCOUNT' && <Alert tone="danger">{error}</Alert>}
          </div>
        )
      })}

      <Button
        variant="secondary"
        isFullWidth="mobile"
        iconStart={<IconPlus />}
        disabled={value.length >= maxRows}
        onClick={() => {
          onChange([...value, newRewardDraft()])
        }}
      >
        Добавить награду
      </Button>
    </div>
  )
}
