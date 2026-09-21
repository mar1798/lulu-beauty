import React, { useMemo } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import type { ICategory } from 'widgets/types'
import { Alert, Button, VisuallyHidden } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { ProductGrid } from 'widgets/organisms'
import { IconHeart } from 'widgets/svg'
import { CatalogTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { AddToCartButton } from '@/components/AddToCartButton'
import { WishlistButton } from '@/components/WishlistButton'
import { useAuth } from '@/contexts/AuthContext'
import { useWishlist } from '@/contexts/WishlistContext'
import { listCategories } from '@/services/endpoints/catalog'
import { categoriesKey } from '@/services/swrKeys'
import * as styles from '@/styles/layout.css'

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
    /*
      Пока сессия не проверена, не показываем ничего.

      «Войдите» тут нельзя: у вошедшего это была бы вспышка чужого экрана
      вместо его списка. Но и скелетон сетки нельзя — восемь карточек это
      больше тысячи пикселей, и у гостя они через полсекунды схлопывались в
      короткое «войдите», втягивая подвал обратно в кадр. Ровно это и есть
      CLS 0.394 — худший на сайте.
    */
    if (isAuthLoading) {
      return null
    }

    if (user === null) {
      return (
        <EmptyState
          title="Избранное у каждого своё"
          description="Войдите, чтобы сохранять товары — список дождётся следующего сбора"
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
          isLoading={isLoading}
          buildHref={product => `/catalog/${product.slug}`}
          categoryNames={categoryNames}
          renderAction={product =>
            product.inStock ? <AddToCartButton product={product} isCompact={true} /> : null
          }
          // Здесь сердце всегда залито, и нажатие убирает товар из списка.
          renderMediaAction={product => (
            <WishlistButton productId={product.id} productName={product.name} />
          )}
          emptyState={
            <EmptyState
              title="Пока пусто"
              description={
                <>
                  {/*
                    Само сердце вместо слова «сердце»: подсказка показывает ту же
                    кнопку, что стоит в углу фотографии в каталоге. Иконка скрыта
                    от скринридера (`aria-hidden` у всего набора), поэтому слово
                    рядом с ней остаётся — иначе фраза читалась бы «нажмите на на
                    товаре».
                  */}
                  Нажмите на <IconHeart className={styles.inlineIcon} />
                  <VisuallyHidden>сердце</VisuallyHidden> на товаре в каталоге — он сохранится здесь
                  до следующего сбора
                </>
              }
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
        <title>Избранное — Sululu</title>
        <meta name="robots" content="noindex" />
      </Head>

      <CatalogTemplate
        title="Избранное"
        summary={products.length === 0 ? undefined : `Сохранено товаров: ${products.length}`}
      >
        <div className={styles.sessionArea}>{content()}</div>
      </CatalogTemplate>
    </SiteLayout>
  )
}

export default WishlistPage
