import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { mutate as globalMutate } from 'swr'
import type { INewsBannerDraft } from 'widgets/types'
import { Button } from 'widgets/atoms'
import { AdminNewsBannerForm } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { messageForError } from '@/services/apiErrors'
import { createNewsBanner, uploadNewsBannerImage } from '@/services/endpoints/banners'
import { SHOWCASE_PATHS, refreshPublicPages } from '@/services/endpoints/revalidate'
import { isAdminBannersKey } from '@/services/swrKeys'
import { toNewsBannerInput } from '@/utils/banners'

/**
 * Новая новость для карусели.
 *
 * Картинки выбираются в форме и грузятся следующими запросами сразу после создания:
 * id новости появляется только в ответе на первый. Неудача картинки не откатывает
 * новость - она уже создана, и причину владельцу называют прямо здесь; загрузить
 * файл он сможет на карточке новости, куда страница и ведёт после сохранения (так
 * же устроено создание акции).
 */
const AdminNewsBannerCreatePage: React.FC = () => {
  const router = useRouter()
  const { notify } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (values: INewsBannerDraft): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const created = await createNewsBanner(toNewsBannerInput(values))
      const failures: string[] = []

      for (const variant of ['mobile', 'desktop'] as const) {
        const file = values.images[variant]

        if (file === null) {
          continue
        }

        try {
          await uploadNewsBannerImage(created.id, variant, file)
        } catch (cause: unknown) {
          failures.push(
            `${variant === 'mobile' ? 'Мобильная' : 'Десктопная'} картинка: ${messageForError(cause, 'admin.news.image')}`
          )
        }
      }

      notify({ tone: 'success', title: 'Новость создана', description: values.title })

      if (failures.length > 0) {
        notify({
          tone: 'info',
          title: 'Картинки загрузились не все',
          description: `${failures.join(' ')} Повторите на карточке новости.`,
        })
      }

      refreshPublicPages(...SHOWCASE_PATHS)
      void globalMutate(isAdminBannersKey)
      await router.push(`/admin/banners/news/${created.id}`)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'admin.news.create'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminShell
      title="Новая новость"
      summary="Появится в карусели первой, пока вы не переставите её в «Баннерах»"
      actions={
        <Button isFullWidth="mobile" variant="secondary" link={{ href: '/admin/banners' }}>
          К баннерам
        </Button>
      }
    >
      <AdminNewsBannerForm
        isSubmitting={isSubmitting}
        error={error}
        onSubmit={values => {
          void handleSubmit(values)
        }}
      />
    </AdminShell>
  )
}

export default AdminNewsBannerCreatePage
