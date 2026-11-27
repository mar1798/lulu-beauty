import React from 'react'
import type { GetStaticPaths, GetStaticProps } from 'next'
import type { IPublicPromotion } from 'widgets/types'
import { Breadcrumbs } from 'widgets/molecules'
import { PromotionDetails } from 'widgets/organisms'
import { ProductTemplate } from 'widgets/templates'
import { formatDate } from 'widgets/utils'
import { SiteLayout } from '@/layouts/SiteLayout'
import { JsonLd } from '@/components/JsonLd'
import { PageMeta } from '@/components/PageMeta'
import { isApiError } from '@/services/apiErrors'
import { getPublicPromotion, listPublicPromotions } from '@/services/endpoints/promotions'
import { breadcrumbsLd } from '@/utils/jsonLd'
import { promotionDescription, promotionTitle } from '@/utils/promotionSeo'

/**
 * Страница акции.
 *
 * Тот же приём, что у товара: `fallback: 'blocking'` и ISR. Образ собирается без
 * доступа к API, поэтому `getStaticPaths` на проде пуст, и страница акции рождается
 * по первому заходу - либо готовой, либо честным 404. Минутный `revalidate` - только
 * страховка: сохранение, включение и удаление акции в админке пересобирают страницу
 * сразу (`/api/revalidate`, `promotionPath`).
 *
 * Акция, которая не идёт сейчас (не началась, закончилась, выключена, в архиве), бэкенд
 * отдаёт как 404, и страница с `notFound` теряет адрес - после пересборки ссылка на
 * неё честно не открывается. Уже собранная копия живёт до пересборки, поэтому
 * админка и зовёт её при каждом переключении.
 */

const REVALIDATE_SECONDS = 60
const NOT_FOUND = 404

interface IPromotionPageProps {
  promotion: IPublicPromotion
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const promotions = await listPublicPromotions()

    return {
      paths: promotions.map(promotion => ({ params: { slug: promotion.slug } })),
      fallback: 'blocking',
    }
  } catch {
    // API недоступен на сборке - страницы соберутся по первому обращению.
    return { paths: [], fallback: 'blocking' }
  }
}

export const getStaticProps: GetStaticProps<IPromotionPageProps, { slug: string }> = async ({
  params,
}) => {
  const slug = params?.slug

  if (slug === undefined) {
    return { notFound: true }
  }

  try {
    return {
      props: { promotion: await getPublicPromotion(slug) },
      revalidate: REVALIDATE_SECONDS,
    }
  } catch (error) {
    if (isApiError(error) && error.status === NOT_FOUND) {
      return { notFound: true, revalidate: REVALIDATE_SECONDS }
    }

    throw error
  }
}

/**
 * Картинка превью - десктопный баннер, а без него мобильный: у ссылки в мессенджере
 * рамка широкая. Адрес уже абсолютный (`PUBLIC_FILES_BASE_URL`).
 */
const previewImage = (promotion: IPublicPromotion): { url: string; alt: string } | undefined => {
  const url = promotion.bannerDesktopUrl ?? promotion.bannerMobileUrl

  return url === null ? undefined : { url, alt: promotion.title }
}

const PromotionPage: React.FC<IPromotionPageProps> = ({ promotion }) => {
  const path = `/promotions/${promotion.slug}`
  const breadcrumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Каталог', path: '/catalog' },
    { name: promotion.title, path },
  ]

  return (
    <SiteLayout>
      <PageMeta
        title={promotionTitle(promotion)}
        description={promotionDescription(promotion, formatDate)}
        path={path}
        image={previewImage(promotion)}
      />

      <JsonLd data={breadcrumbsLd(breadcrumbs)} />

      <ProductTemplate
        breadcrumbs={
          <Breadcrumbs
            items={breadcrumbs.slice(0, -1).map(item => ({
              label: item.name,
              link: { href: item.path },
            }))}
            current={promotion.title}
          />
        }
      >
        <PromotionDetails promotion={promotion} catalogHref="/catalog" />
      </ProductTemplate>
    </SiteLayout>
  )
}

export default PromotionPage
