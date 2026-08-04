import React from 'react'
import Head from 'next/head'
import type { GetStaticPaths, GetStaticProps } from 'next'
import type { IProduct } from 'widgets/types'
import { Text } from 'widgets/atoms'
import { Breadcrumbs } from 'widgets/molecules'
import { ProductDetails } from 'widgets/organisms'
import { ProductTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { isApiError } from '@/services/apiErrors'
import { getProduct, listCategories, listProducts } from '@/services/endpoints/catalog'

/**
 * Страница товара.
 *
 * `fallback: 'blocking'`, потому что товары появляются пачками через импорт
 * xlsx: заранее собрать все пути невозможно, а показывать спиннер вместо
 * товара — плохо и для покупателя, и для поисковика.
 */

const REVALIDATE_SECONDS = 60

/** Сколько товаров пререндерить на сборке; остальные соберутся по первому заходу. */
const PREBUILT_PRODUCTS = 100

const NOT_FOUND = 404

interface IProductPageProps {
  product: IProduct
  /** У товара приходит только `categoryId` — имя резолвится здесь, на сервере. */
  categoryName: string | null
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const firstPage = await listProducts({ pageSize: PREBUILT_PRODUCTS })

    return {
      paths: firstPage.items.map(product => ({ params: { slug: product.slug } })),
      fallback: 'blocking',
    }
  } catch {
    // API недоступен на сборке — все страницы соберутся по первому обращению.
    return { paths: [], fallback: 'blocking' }
  }
}

export const getStaticProps: GetStaticProps<IProductPageProps, { slug: string }> = async ({
  params,
}) => {
  const slug = params?.slug

  if (slug === undefined) {
    return { notFound: true }
  }

  try {
    const product = await getProduct(slug)
    const categories = await listCategories().catch(() => [])
    const category = categories.find(item => item.id === product.categoryId)

    return {
      props: { product, categoryName: category?.name ?? null },
      revalidate: REVALIDATE_SECONDS,
    }
  } catch (error) {
    // Удалённый товар должен отдавать 404, а не 500.
    if (isApiError(error) && error.status === NOT_FOUND) {
      return { notFound: true, revalidate: REVALIDATE_SECONDS }
    }

    throw error
  }
}

const ProductPage: React.FC<IProductPageProps> = ({ product, categoryName }) => (
  <SiteLayout>
    <Head>
      <title>{`${product.name} — Lulu Beauty`}</title>
      {product.description !== null && product.description !== '' && (
        <meta name="description" content={product.description.slice(0, 160)} />
      )}
    </Head>

    <ProductTemplate
      breadcrumbs={
        <Breadcrumbs
          items={[
            { label: 'Главная', link: { href: '/' } },
            { label: 'Каталог', link: { href: '/catalog' } },
          ]}
          current={product.name}
        />
      }
    >
      <ProductDetails
        product={product}
        categoryName={categoryName}
        action={
          product.inStock ? (
            <AddToCartButton productId={product.id} size="lg" />
          ) : (
            <Text tone="muted">Товара сейчас нет в наличии — загляните в следующий сбор.</Text>
          )
        }
      />
    </ProductTemplate>
  </SiteLayout>
)

export default ProductPage
