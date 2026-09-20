import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR, { mutate as globalMutate } from 'swr'
import type { IOrder, IToastTone } from 'widgets/types'
import { Alert, Button } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { OrderDetails, ProductPicker } from 'widgets/organisms'
import { useConfirm, useToast } from 'widgets/contexts'
import { AccountTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { ACCOUNT_NAVIGATION } from '@/layouts/accountNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { useProductSearch } from '@/hooks/useProductSearch'
import { isApiError, messageForError, type ErrorScope } from '@/services/apiErrors'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import {
  addMyOrderItem,
  cancelMyOrder,
  getMyOrder,
  removeMyOrderItem,
  restoreMyOrder,
  updateMyOrderItemQuantity,
  updateMyOrderNote,
} from '@/services/endpoints/orders'
import { activeCycleKey, isOrdersKey, orderKey } from '@/services/swrKeys'
import { INSTAGRAM_URL } from '@/utils/contacts'

/**
 * Одна заявка покупателя.
 *
 * Чужая заявка отдаёт с бэкенда 404 (`get_for_user` фильтрует по владельцу),
 * поэтому «не найдена» и «не ваша» здесь намеренно один и тот же экран:
 * подтверждать существование чужой заявки незачем.
 *
 * Правка состава — количество, удаление позиций, добавление товара и
 * комментарий — доступна, пока сбор открыт и владелец не подтвердил заявку;
 * решает это бэкенд и присылает в `isEditable`. После каждой правки заявка
 * перечитывается целиком (`mutate()`), а не правится на месте: сумму и сам
 * `isEditable` считает сервер — дедлайн мог пройти между двумя нажатиями.
 * Список заявок (`/orders`) ревалидируется тем же действием — той же
 * заявке там не пришлось бы ждать отдельного захода на страницу.
 *
 * Товар добавляется прямо в заявку (`POST /orders/{id}/items`), а не через
 * корзину: корзина копится под следующую заявку и эту не изменила бы.
 *
 * Отмена живёт дольше правки (`isCancellable`): против неподтверждённой заявки
 * ничего не куплено, поэтому отозвать её можно и из закрытого сбора — раньше
 * там не оставалось ни одного действия. Обрывается она на `UNFULFILLED`: мимо
 * такой заявки закупка уже прошла, и «я передумал» записало бы молчание
 * магазина как решение покупателя. Своя отмена обратима ровно в том же окне
 * (`isRestorable`, `POST /orders/{id}/restore`): состав и цены отмена не
 * трогает, поэтому возврат — это смена статуса, а не повторное оформление.
 * Отмену владельца снимает только владелец — тогда `isRestorable` приходит
 * `false`, и кнопки возврата нет.
 *
 * Активный сбор запрашивается отдельно — у `OrderResponse` есть только
 * `cycleId`, а публичной ручки «цикл по id» на бэкенде нет.
 */

const NOT_FOUND = 404

const productHref = (slug: string): string => `/catalog/${slug}`

const OrderPage: React.FC = () => {
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { notify } = useToast()
  const { confirm } = useConfirm()

  const userId = user?.id ?? null
  const orderId = typeof router.query.id === 'string' ? router.query.id : null

  const [isBusy, setIsBusy] = useState(false)
  /** Строка состава, по которой идёт запрос: блокируется она, а не вся карточка. */
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const search = useProductSearch()

  const {
    data: order,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR<IOrder>(userId === null || orderId === null ? null : orderKey(userId, orderId), () =>
    getMyOrder(orderId as string)
  )

  const error = fetchError === undefined ? null : messageForError(fetchError, 'order.load')
  const status = isApiError(fetchError) ? fetchError.status : null

  // Сбор — справочная деталь: его ошибку молча игнорируем, заявка важнее.
  const { data: cycle = null } = useSWR(userId === null ? null : activeCycleKey, () =>
    getActiveCycleOrNull()
  )

  /**
   * `undo` — обратный ход в тосте об удавшемся действии («Вернуть» после
   * удаления позиции). Показывается только когда действие удалось: предлагать
   * отменить то, чего не произошло, — врать.
   *
   * `tone` — тон того же тоста. По умолчанию `success`, но удаление позиции
   * сообщает о потере, а не об успехе, и идёт `warning`.
   */
  const runAction = async (
    action: () => Promise<unknown>,
    success: string,
    scope: ErrorScope,
    itemId: string | null = null,
    done: { tone?: IToastTone; undo?: () => void } = {}
  ): Promise<void> => {
    setIsBusy(true)
    setBusyItemId(itemId)
    setActionError(null)

    try {
      await action()
      await mutate()

      if (userId !== null) {
        // Тегом, а не одним ключом: список постраничный, и правка заявки меняет
        // не только ту страницу, на которой её открыли.
        void globalMutate(isOrdersKey)
      }

      notify({
        tone: done.tone ?? 'success',
        title: success,
        action: done.undo === undefined ? undefined : { label: 'Вернуть', onAction: done.undo },
      })
    } catch (cause: unknown) {
      /*
        Текст выбирается по действию, а не по одному коду: между открытием
        страницы и нажатием мог пройти дедлайн или владелец мог подтвердить
        заявку, и `order_not_editable` должен звучать как «количество уже не
        изменить» или «отменить нельзя» — смотря что нажали.
      */
      const message = messageForError(cause, scope)

      setActionError(message)
      notify({ tone: 'danger', title: 'Не получилось', description: message })
      // Перечитываем: заявка на экране уже разошлась с тем, что на сервере.
      await mutate()
    } finally {
      setIsBusy(false)
      setBusyItemId(null)
    }
  }

  const handleCancel = async (): Promise<void> => {
    if (orderId === null) {
      return
    }

    const confirmed = await confirm({
      title: 'Отменить заявку?',
      description:
        'Мы увидим, что вы передумали. Пока заявка ждёт подтверждения, отмену можно ' +
        'отозвать — заявка вернётся тем же составом',
      confirmLabel: 'Отменить заявку',
      cancelLabel: 'Оставить',
      tone: 'danger',
    })

    if (confirmed) {
      await runAction(() => cancelMyOrder(orderId), 'Заявка отменена', 'order.cancel')
    }
  }

  /*
    Подпись раздела следует за состоянием заявки: обещать правку над
    подтверждённой заявкой — врать, а над правимой или возвратимой молчать —
    прятать единственное действие, ради которого сюда и заходят.
  */
  const summary = (): string => {
    if (order?.isEditable === true) {
      return 'Пока сбор открыт и заявка не подтверждена, состав можно поменять — в том числе добавить товар'
    }

    if (order?.isRestorable === true) {
      return 'Заявка отменена, но её ещё не начали закупать — можно вернуть в работу'
    }

    /*
      Заявка ждёт в закрытом сборе: подпись раздела — первое, что читают, и
      обещать здесь снимок цен вместо ответа на «почему так долго» значит
      отвечать не на тот вопрос. Стадии разведены, потому что на `UNFULFILLED`
      отмены уже нет (`isCancellable`), и звать нажать её было бы враньём.
    */
    if (order?.pendingStage === 'DELAYED') {
      return 'Сбор закрыт, а заявку так и не подтвердили — отменить её можно в любой момент'
    }

    if (order?.pendingStage === 'UNFULFILLED') {
      return 'Заявка не вошла в закупку — ответ за нами'
    }

    return 'Состав и цены закрепляются в момент подтверждения — дальше они не меняются вслед за каталогом'
  }

  const content = (): React.ReactNode => {
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Заявка видна после входа"
          description="Войдите тем же номером, с которого её оформляли"
          action={
            <Button link={{ href: '/login' }} isFullWidth="mobile">
              Войти
            </Button>
          }
        />
      )
    }

    // Скелетон в раскладке карточки заявки — она известна до ответа.
    if (isAuthLoading || isLoading || orderId === null) {
      return <OrderDetails order={null} isLoading={true} buildProductHref={productHref} />
    }

    if (status === NOT_FOUND) {
      return (
        <EmptyState
          title="Заявка не найдена"
          description="Возможно, ссылка устарела или заявка оформлена на другой аккаунт"
          action={
            <Button link={{ href: '/orders' }} isFullWidth="mobile">
              К моим заявкам
            </Button>
          }
        />
      )
    }

    if (error !== null || order === undefined) {
      return (
        <Alert
          tone="danger"
          title="Не получилось"
          /*
            Повтор — та же перезагрузка, что после правки: чаще всего сюда
            приводит оборванная сеть, и уводить человека со страницы, чтобы
            он вернулся тем же адресом, незачем.
          */
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void mutate()
              }}
            >
              Повторить
            </Button>
          }
        >
          {error ?? 'Не удалось загрузить заявку'}
        </Alert>
      )
    }

    return (
      <OrderDetails
        order={order}
        buildProductHref={productHref}
        isCurrentCycle={cycle !== null && cycle.id === order.cycleId}
        /*
          Отмену владельца покупатель не отзывает, и единственный обратный
          адрес магазина — Instagram: тот же, что уходит кнопкой под
          уведомлением бота об этой же отмене.
        */
        contactLink={{ href: INSTAGRAM_URL, target: '_blank' }}
        onItemQuantityChange={(itemId, quantity) => {
          void runAction(
            () => updateMyOrderItemQuantity(order.id, itemId, quantity),
            'Количество изменено',
            'order.item.update',
            itemId
          )
        }}
        onItemRemove={itemId => {
          const item = order.items.find(orderItem => orderItem.id === itemId)
          /*
            Состав строки известен только до удаления — после неё заявка
            приедет уже без него. Возврат идёт добавлением товара
            (`POST /orders/{id}/items`), поэтому у позиции удалённого из
            каталога товара (`productId === null`) его нет: такую строку
            бэкенд заново не примет, и обещать «Вернуть» нельзя.
          */
          const productId = item?.productId ?? null
          const quantity = item?.quantity ?? 1

          // Названием, а не «позицией»: тост об удалении читают, когда уже
          // не смотрят на список, и вернуть надо понимая, что именно убрали.
          const name = item?.productName

          void runAction(
            () => removeMyOrderItem(order.id, itemId),
            name === undefined ? 'Позиция убрана' : `«${name}» убран`,
            'order.item.remove',
            itemId,
            {
              tone: 'warning',
              undo:
                productId === null
                  ? undefined
                  : () => {
                      void runAction(
                        () => addMyOrderItem(order.id, productId, quantity),
                        'Вернулся в заявку',
                        'order.item.add'
                      )
                    },
            }
          )
        }}
        /*
          Добавление товара прямо в заявку, а не через корзину: корзина копится
          под следующий сбор, и положенное в неё эту заявку не изменило бы.
        */
        addItem={
          <ProductPicker
            query={search.query}
            onQueryChange={search.setQuery}
            products={search.products}
            isSearching={search.isSearching}
            error={search.error}
            addedProductIds={order.items
              .map(item => item.productId)
              .filter((productId): productId is string => productId !== null)}
            onAdd={productId => {
              void runAction(
                () => addMyOrderItem(order.id, productId),
                'Товар добавлен',
                'order.item.add'
              )
            }}
            isBusy={isBusy}
          />
        }
        onNoteSave={note => {
          void runAction(
            () => updateMyOrderNote(order.id, note),
            'Комментарий сохранён',
            'order.note'
          )
        }}
        onCancel={() => {
          void handleCancel()
        }}
        /*
          Возврат без подтверждения — в отличие от отмены: он ничего не рушит,
          а чинит, и лишний диалог тут только мешал бы исправить промах.
        */
        onRestore={() => {
          void runAction(() => restoreMyOrder(order.id), 'Заявка снова в работе', 'order.restore')
        }}
        isBusy={isBusy}
        busyItemId={busyItemId}
        error={actionError}
      />
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Заявка — Sululu</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AccountTemplate
        title="Заявка"
        summary={summary()}
        navigation={ACCOUNT_NAVIGATION}
        currentHref="/orders"
      >
        {content()}
      </AccountTemplate>
    </SiteLayout>
  )
}

export default OrderPage
