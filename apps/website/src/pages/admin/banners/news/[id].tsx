import React, { useState } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate as globalMutate } from 'swr'
import type { INewsBannerDraft, PromotionBannerVariant } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminNewsBannerForm } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { isApiError, messageForError } from '@/services/apiErrors'
import {
  deleteNewsBanner,
  getAdminNewsBanner,
  removeNewsBannerImage,
  updateNewsBanner,
  uploadNewsBannerImage,
} from '@/services/endpoints/banners'
import { SHOWCASE_PATHS, refreshPublicPages } from '@/services/endpoints/revalidate'
import { adminNewsBannerKey, isAdminBannersKey } from '@/services/swrKeys'
import { deleteNewsConfirmation, toNewsBannerInput } from '@/utils/banners'

/**
 * Карточка новости: поля, период и картинки.
 *
 * Картинка сохраняется сразу, без «Сохранить» формы: это файл, а не поле, и ответ
 * сервера возвращает новость целиком - страница кладёт его в кеш, не пересоздавая
 * форму (иначе несохранённые правки полей пропали бы). После «Сохранить», наоборот,
 * форма пересоздаётся (`saveVersion`) и показывает то, что вернул бэкенд.
 */

const NOT_FOUND = 404

const AdminNewsBannerPage: React.FC = () => {
  const router = useRouter()
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const newsId = typeof router.query.id === 'string' ? router.query.id : null

  const [saveVersion, setSaveVersion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isImageBusy, setIsImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  const {
    data: item,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR(newsId === null ? null : adminNewsBannerKey(newsId), () =>
    getAdminNewsBanner(newsId as string)
  )

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.news.load')
  const status = isApiError(fetchError) ? fetchError.status : null
  const news = item?.news ?? null

  const refreshAfterChange = (): void => {
    refreshPublicPages(...SHOWCASE_PATHS)
    void globalMutate(isAdminBannersKey)
  }

  const handleSubmit = async (values: INewsBannerDraft): Promise<void> => {
    if (newsId === null) {
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const saved = await updateNewsBanner(newsId, toNewsBannerInput(values))

      notify({ tone: 'success', title: 'Новость сохранена' })
      await mutate(saved, { revalidate: false })
      refreshAfterChange()
      setSaveVersion(current => current + 1)
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.news.update'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const runImageAction = async (
    action: () => ReturnType<typeof uploadNewsBannerImage>,
    success: string
  ): Promise<void> => {
    setIsImageBusy(true)
    setImageError(null)

    try {
      const saved = await action()

      notify({ tone: 'success', title: success })
      // Без `saveVersion`: форма остаётся со своими несохранёнными правками, картинки идут отдельным пропом.
      await mutate(saved, { revalidate: false })
      refreshAfterChange()
    } catch (cause: unknown) {
      setImageError(messageForError(cause, 'admin.news.image'))
    } finally {
      setIsImageBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (item === undefined || newsId === null) {
      return
    }

    const confirmed = await confirm(deleteNewsConfirmation(item))

    if (!confirmed) {
      return
    }

    try {
      await deleteNewsBanner(newsId)
      notify({ tone: 'success', title: 'Новость удалена' })
      refreshAfterChange()
      await router.push('/admin/banners')
    } catch (cause: unknown) {
      setFormError(messageForError(cause, 'admin.news.delete'))
    }
  }

  const content = (): React.ReactNode => {
    if (status === NOT_FOUND) {
      return (
        <EmptyState
          title="Новость не найдена"
          description="Возможно, её уже удалили или ссылка устарела"
          action={
            <Button isFullWidth="mobile" link={{ href: '/admin/banners' }}>
              К баннерам
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

    if (isLoading || item === undefined || news === null) {
      return <Skeleton height={420} shape="block" />
    }

    return (
      <AdminNewsBannerForm
        // Форма берёт значения при монтировании: если пришли свежие данные с другим «включена»
        // (новость переключили в списке), пересоздаём её, иначе «Сохранить» вернёт старое.
        key={`${saveVersion}-${news.isEnabled}`}
        initialValues={news}
        savedImages={{ mobile: news.imageMobileUrl, desktop: news.imageDesktopUrl }}
        isImageBusy={isImageBusy}
        imageError={imageError}
        isSubmitting={isSubmitting}
        error={formError}
        onSubmit={values => {
          void handleSubmit(values)
        }}
        onImageUpload={(variant: PromotionBannerVariant, file) => {
          void runImageAction(
            () => uploadNewsBannerImage(item.id, variant, file),
            'Картинка загружена'
          )
        }}
        onImageRemove={(variant: PromotionBannerVariant) => {
          void runImageAction(() => removeNewsBannerImage(item.id, variant), 'Картинка убрана')
        }}
        footer={
          <Button
            isFullWidth="mobile"
            variant="danger"
            onClick={() => {
              void handleDelete()
            }}
          >
            Удалить новость
          </Button>
        }
      />
    )
  }

  return (
    <AdminShell
      title={news?.title ?? 'Новость'}
      summary="Слайд карусели на главной и в каталоге"
      actions={
        <Button isFullWidth="mobile" variant="secondary" link={{ href: '/admin/banners' }}>
          К баннерам
        </Button>
      }
    >
      {content()}
    </AdminShell>
  )
}

export default AdminNewsBannerPage
