import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminPromotionValues, IPromotion, PromotionBannerVariant } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminPromotionForm } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { usePromotionCatalog } from '@/hooks/usePromotionCatalog'
import { usePromotionParticipants } from '@/hooks/usePromotionParticipants'
import { isApiError, messageForError } from '@/services/apiErrors'
import {
  deletePromotion,
  getAdminPromotion,
  removePromotionBanner,
  updatePromotion,
  uploadPromotionBanner,
} from '@/services/endpoints/promotions'
import { SHOWCASE_PATHS, promotionPath, refreshPublicPages } from '@/services/endpoints/revalidate'
import { adminPromotionKey, isAdminPromotionsKey } from '@/services/swrKeys'
import { deleteConfirmation, initialValuesOf, toPromotionInput } from '@/utils/promotions'

/**
 * Карточка акции: поля, баннеры, условия и награды.
 *
 * Баннер сохраняется сразу, без «Сохранить» формы: это файл, а не поле, и ответ
 * сервера возвращает акцию целиком — страница кладёт его в кеш, не пересоздавая
 * форму (иначе несохранённые правки полей пропали бы, как у галереи товара).
 * После «Сохранить», наоборот, форма пересоздаётся (`saveVersion`) и показывает
 * то, что вернул бэкенд: нормализованный slug, подрезанное название.
 *
 * Архивная акция открывается как обычно, но с предупреждением: покупатели её уже
 * не видят, а адрес остаётся занят.
 */

const NOT_FOUND = 404

const AdminPromotionPage: React.FC = () => {
  const router = useRouter()
  const { notify } = useToast()
  const { confirm } = useConfirm()
  const participants = usePromotionParticipants()

  const promotionId = typeof router.query.id === 'string' ? router.query.id : null

  const [saveVersion, setSaveVersion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isBannerBusy, setIsBannerBusy] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)

  const {
    data: promotion,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR(promotionId === null ? null : adminPromotionKey(promotionId), () =>
    getAdminPromotion(promotionId as string)
  )

  const error =
    fetchError === undefined ? null : messageForError(fetchError, 'admin.promotions.load')
  const status = isApiError(fetchError) ? fetchError.status : null

  const catalog = usePromotionCatalog(promotion?.conditions, promotion?.rewards)
  const initialValues = useMemo(
    () => (promotion === undefined ? undefined : initialValuesOf(promotion)),
    [promotion]
  )

  /*
    Страница акции пересобирается и под прежним slug: его могли переписать, а старый
    адрес остаётся в кеше и в выдаче, пока его не обновить (он ответит 404).
  */
  const refreshAfterChange = (...extraSlugs: string[]): void => {
    refreshPublicPages(
      ...SHOWCASE_PATHS,
      ...[promotion?.slug, ...extraSlugs].map(slug =>
        slug === undefined ? undefined : promotionPath(slug)
      )
    )
    void globalMutate(isAdminPromotionsKey)
  }

  const handleSubmit = async (values: IAdminPromotionValues): Promise<void> => {
    if (promotionId === null) {
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const saved = await updatePromotion(promotionId, toPromotionInput(values))

      notify({ tone: 'success', title: 'Акция сохранена' })
      await mutate(saved, { revalidate: false })
      refreshAfterChange(saved.slug)
      setSaveVersion(current => current + 1)
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.promotion.update'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const runBannerAction = async (
    action: () => Promise<IPromotion>,
    success: string
  ): Promise<void> => {
    setIsBannerBusy(true)
    setBannerError(null)

    try {
      const saved = await action()

      notify({ tone: 'success', title: success })
      // Без `saveVersion`: форма остаётся со своими несохранёнными правками, баннеры идут отдельным пропом.
      await mutate(saved, { revalidate: false })
      refreshAfterChange()
    } catch (cause: unknown) {
      setBannerError(messageForError(cause, 'admin.promotion.banner'))
    } finally {
      setIsBannerBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (promotion === undefined) {
      return
    }

    const confirmed = await confirm(deleteConfirmation(promotion))

    if (!confirmed) {
      return
    }

    try {
      await deletePromotion(promotion.id)
      notify({
        tone: 'success',
        title: promotion.participantsCount > 0 ? 'Акция убрана в архив' : 'Акция удалена',
      })
      refreshAfterChange()
      await router.push('/admin/promotions')
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.promotion.delete'))
    }
  }

  const content = (): React.ReactNode => {
    if (status === NOT_FOUND) {
      return (
        <EmptyState
          title="Акция не найдена"
          description="Возможно, её удалили насовсем или ссылка устарела"
          action={
            <Button isFullWidth="mobile" link={{ href: '/admin/promotions' }}>
              К списку акций
            </Button>
          }
        />
      )
    }

    if (error !== null) {
      return (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )
    }

    if (isLoading || promotion === undefined || initialValues === undefined) {
      return <Skeleton height={420} shape="block" />
    }

    return (
      <>
        {promotion.deletedAt !== null && (
          <Alert tone="warning" title="Акция в архиве">
            Покупатели её не видят, а адрес (slug) остаётся занят. Участие и выданные промокоды
            сохранены в заявках.
          </Alert>
        )}

        <AdminPromotionForm
          key={saveVersion}
          catalog={catalog}
          initialValues={initialValues}
          savedBanners={{
            mobile: promotion.bannerMobileUrl,
            desktop: promotion.bannerDesktopUrl,
          }}
          isBannerBusy={isBannerBusy}
          bannerError={bannerError}
          isSubmitting={isSubmitting}
          error={formError}
          onSubmit={values => {
            void handleSubmit(values)
          }}
          onBannerUpload={(variant: PromotionBannerVariant, file) => {
            void runBannerAction(
              () => uploadPromotionBanner(promotion.id, variant, file),
              'Баннер загружен'
            )
          }}
          onBannerRemove={(variant: PromotionBannerVariant) => {
            void runBannerAction(() => removePromotionBanner(promotion.id, variant), 'Баннер снят')
          }}
          footer={
            promotion.deletedAt === null ? (
              <Button
                isFullWidth="mobile"
                variant="danger"
                onClick={() => {
                  void handleDelete()
                }}
              >
                {promotion.participantsCount > 0 ? 'В архив' : 'Удалить акцию'}
              </Button>
            ) : undefined
          }
        />
      </>
    )
  }

  return (
    <AdminShell
      title={promotion?.title ?? 'Акция'}
      summary={promotion === undefined ? undefined : `/promotions/${promotion.slug}`}
      actions={
        <>
          {promotion !== undefined && (
            <Button
              isFullWidth="mobile"
              variant="secondary"
              onClick={() => {
                participants.open(promotion)
              }}
            >
              Участники ({promotion.participantsCount})
            </Button>
          )}
          <Button isFullWidth="mobile" variant="secondary" link={{ href: '/admin/promotions' }}>
            К списку
          </Button>
        </>
      }
    >
      {content()}
      {participants.dialog}
    </AdminShell>
  )
}

export default AdminPromotionPage
