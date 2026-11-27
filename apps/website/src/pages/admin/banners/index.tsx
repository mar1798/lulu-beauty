import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IAdminBannerItem } from 'widgets/types'
import { Alert, Button, Heading } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { AdminBannersBoard, PromoCarousel } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { IconPlus } from 'widgets/svg'
import { AdminShell } from '@/layouts/AdminShell'
import { messageForError, type ErrorScope } from '@/services/apiErrors'
import {
  deleteNewsBanner,
  listAdminBanners,
  reorderBanners,
  setNewsBannerEnabled,
  setPromotionShown,
} from '@/services/endpoints/banners'
import { SHOWCASE_PATHS, refreshPublicPages } from '@/services/endpoints/revalidate'
import {
  adminBannersKey,
  adminNewsBannerKey,
  adminPromotionKey,
  isAdminPromotionsKey,
} from '@/services/swrKeys'
import {
  arrangedBy,
  deleteNewsConfirmation,
  replacedItem,
  shownSlides,
  withShown,
} from '@/utils/banners'
import * as styles from '@/styles/admin.css'

/**
 * «Баннеры»: акции и новости в одной карусели каталога и главной.
 *
 * Сверху - живое превью «Сейчас на витрине»: тот же `PromoCarousel` из строк со
 * статусом `SHOWN` в порядке списка, поэтому оно совпадает с витриной по составу и
 * порядку. Ниже - список (`AdminBannersBoard`) с выключателем «Показывать в
 * карусели», стрелками порядка и действиями над новостью.
 *
 * Переключатель и порядок правятся «сразу»: список обновляется до ответа и
 * откатывается при ошибке (SWR `optimisticData`). Ответ сервера - единственный
 * источник правды о состоянии строки: он подменяет её (`replacedItem`). Если
 * порядок отправлен по устаревшему списку (в другой вкладке создали новость),
 * сервер отвечает `banner_order_mismatch` - список перечитывается.
 *
 * Витрина - статика, поэтому после каждого действия просим пересобрать `/` и
 * `/catalog`. Карточка акции показывает «Карусель: показывается/скрыта», поэтому
 * её ключ и список акций тоже обновляются.
 */

const AdminBannersPage: React.FC = () => {
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set())
  const [isReordering, setIsReordering] = useState(false)

  const { data, error: fetchError, mutate } = useSWR(adminBannersKey(), listAdminBanners)

  const error = fetchError === undefined ? null : messageForError(fetchError, 'admin.banners.load')
  const isFirstLoad = data === undefined && fetchError === undefined
  // Список не пришёл: ни «карусель пуста», ни «здесь пока ничего нет» утверждать нельзя.
  const isLoadFailed = data === undefined && fetchError !== undefined
  const slides = shownSlides(data ?? [])

  const reportFailure = (cause: unknown, scope: ErrorScope): void => {
    notify({ tone: 'danger', title: 'Не получилось', description: messageForError(cause, scope) })
  }

  const markBusy = (key: string, isBusy: boolean): void => {
    setBusyKeys(current => {
      const next = new Set(current)

      if (isBusy) {
        next.add(key)
      } else {
        next.delete(key)
      }

      return next
    })
  }

  const afterChange = (item?: IAdminBannerItem): void => {
    refreshPublicPages(...SHOWCASE_PATHS)

    if (item?.promotionId != null) {
      void globalMutate(adminPromotionKey(item.promotionId))
    }

    // Карточка новости держит свою копию в кеше: без этого она откроется со старым «включена».
    if (item?.kind === 'NEWS') {
      void globalMutate(adminNewsBannerKey(item.id))
    }

    void globalMutate(isAdminPromotionsKey)
  }

  const handleToggle = async (item: IAdminBannerItem, isShown: boolean): Promise<void> => {
    const scope: ErrorScope = item.kind === 'NEWS' ? 'admin.news.toggle' : 'admin.banner.toggle'
    const current = data ?? []

    markBusy(item.key, true)

    try {
      const saved = await mutate(
        async () => {
          const result =
            item.kind === 'NEWS'
              ? await setNewsBannerEnabled(item.id, isShown)
              : await setPromotionShown(item.id, isShown)

          return replacedItem(current, result)
        },
        {
          optimisticData: replacedItem(current, withShown(item, isShown)),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      )

      notify({
        tone: 'success',
        title: isShown ? 'Слайд показывается' : 'Слайд скрыт',
        description: item.slide.title,
      })
      afterChange(item)

      if (saved === undefined) {
        await mutate()
      }
    } catch (cause: unknown) {
      reportFailure(cause, scope)
    } finally {
      markBusy(item.key, false)
    }
  }

  const handleReorder = async (keys: string[]): Promise<void> => {
    const current = data ?? []

    setIsReordering(true)

    try {
      await mutate(() => reorderBanners(keys), {
        optimisticData: arrangedBy(current, keys),
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      })

      notify({ tone: 'success', title: 'Порядок сохранён' })
      afterChange()
    } catch (cause: unknown) {
      reportFailure(cause, 'admin.banner.reorder')
      // Список мог измениться под нами - порядок надо строить заново, по свежему.
      await mutate()
    } finally {
      setIsReordering(false)
    }
  }

  const handleDelete = async (item: IAdminBannerItem): Promise<void> => {
    const confirmed = await confirm(deleteNewsConfirmation(item))

    if (!confirmed) {
      return
    }

    markBusy(item.key, true)

    try {
      await deleteNewsBanner(item.id)
      notify({ tone: 'success', title: 'Новость удалена', description: item.slide.title })
      afterChange(item)
      await mutate()
    } catch (cause: unknown) {
      reportFailure(cause, 'admin.news.delete')
    } finally {
      markBusy(item.key, false)
    }
  }

  const addNews = (
    <Button
      isFullWidth="mobile"
      link={{ href: '/admin/banners/news/add' }}
      iconStart={<IconPlus />}
    >
      Добавить новость
    </Button>
  )

  return (
    <AdminShell
      title="Баннеры"
      summary="Что показывает карусель над каталогом и на главной: акции и ваши новости"
      actions={addNews}
    >
      {error !== null && (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      )}

      <section className={styles.stack} aria-labelledby="banners-live">
        <Heading level={2} size="sm" id="banners-live">
          Сейчас на витрине
        </Heading>

        {isFirstLoad || isLoadFailed ? null : slides.length === 0 ? (
          <Alert tone="warning" title="Карусель пуста">
            Карусель сейчас пуста - на витрине её не видно.
          </Alert>
        ) : (
          // Превью не кликабельно: ссылки слайдов не должны уводить из админки.
          <div inert={true} data-testid="banners-live-preview">
            <PromoCarousel slides={slides} />
          </div>
        )}
      </section>

      <section className={styles.stack} aria-labelledby="banners-list">
        <Heading level={2} size="sm" id="banners-list">
          Все баннеры
        </Heading>

        {isLoadFailed ? null : (
          <AdminBannersBoard
            items={data ?? []}
            isLoading={isFirstLoad}
            busyKeys={busyKeys}
            isReordering={isReordering}
            buildPromotionHref={item => `/admin/promotions/${item.id}`}
            buildNewsEditHref={item => `/admin/banners/news/${item.id}`}
            onToggleShown={(item, isShown) => {
              void handleToggle(item, isShown)
            }}
            onReorder={keys => {
              void handleReorder(keys)
            }}
            onDeleteNews={item => {
              void handleDelete(item)
            }}
            emptyState={
              <EmptyState
                title="Здесь появятся акции с баннерами и ваши новости"
                description="Акции с мобильным баннером попадают сюда сами, а новость можно выпустить без дизайнера - текстом"
                action={addNews}
              />
            }
          />
        )}
      </section>
    </AdminShell>
  )
}

export default AdminBannersPage
