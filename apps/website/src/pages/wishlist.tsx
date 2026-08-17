import React, { useMemo } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import type { ICategory } from 'widgets/types'
import { Alert, Button } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { ProductGrid } from 'widgets/organisms'
import { CatalogTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { WishlistButton } from '@/components/WishlistButton'
import { useAuth } from '@/contexts/AuthContext'
import { useWishlist } from '@/contexts/WishlistContext'
import { listCategories } from '@/services/endpoints/catalog'
import { categoriesKey } from '@/services/swrKeys'

/**
 * Избранное. Приватное и целиком клиентское, как корзина: данные идут через
 * прокси, статикой отдавать нечего.
 *
 * Показывается той же сеткой, что и каталог, — избранное отличается от него
 * составом, а не устройством, и вторая раскладка карточки означала бы вторую
 * карточку, которую придётся чинить дважды.
 *
 * Гостя не редиректим, а предлагаем войти: список привязан к аккаунту, и
 * внезапный переход на `/login` из шапки выглядел бы как ошибка.
 *
 * Врезки «приём заказов закрыт» здесь нет намеренно: её совет — «сохраните в
 * избранное» — на самой странице избранного замыкается сам на себя. Почему
 * «в корзину» недоступна, объясняет подсказка на самой кнопке.
 */
const WishlistPage: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth()
  const { wishlist, isLoading, error } = useWishlist()

  // Названия категорий — тем же ключом, что и каталог: список уже в кеше.
  const { data: categories = [] } = useSWR<ICategory[]>(categoriesKey, listCategories)

  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map(category => [category.id, category.name])),
    [categories]
  )

  const products = useMemo(() => (wishlist?.items ?? []).map(item => item.product), [wishlist])

  const content = (): React.ReactNode => {
    // Пока сессия не проверена, «войдите» показывать нельзя: у залогиненного
    // это была бы вспышка чужого экрана вместо его списка.
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Избранное у каждого своё"
          description="Войдите, чтобы сохранять товары — список дождётся следующего сбора."
          action={
            <Button link={{ href: '/login' }} isFullWidth="mobile">
              Войти
            </Button>
          }
        />
      )
    }

    return (
      <>
        {error !== null && (
          <Alert tone="danger" title="Избранное не загрузилось">
            {error}
          </Alert>
        )}

        <ProductGrid
          products={products}
          isLoading={isAuthLoading || isLoading}
          buildHref={product => `/catalog/${product.slug}`}
          categoryNames={categoryNames}
          renderAction={product =>
            product.inStock ? <AddToCartButton productId={product.id} isCompact={true} /> : null
          }
          // Здесь сердце всегда залито, и нажатие убирает товар из списка.
          renderMediaAction={product => <WishlistButton productId={product.id} />}
          emptyState={
            <EmptyState
              title="Пока пусто"
              description="Нажмите на сердце у товара в каталоге — он сохранится здесь до следующего сбора."
              action={
                <Button link={{ href: '/catalog' }} isFullWidth="mobile">
                  В каталог
                </Button>
              }
            />
          }
        />
      </>
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Избранное — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <CatalogTemplate
        title="Избранное"
        summary={
          products.length === 0 ? undefined : `Сохранено товаров: ${products.length}`
        }
      >
        {content()}
      </CatalogTemplate>
    </SiteLayout>
  )
}

export default WishlistPage
