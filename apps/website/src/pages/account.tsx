import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { Alert, AppLink, Button, Divider, Text } from 'widgets/atoms'
import { useConfirm } from 'widgets/contexts'
import { EmptyState, orderNumber } from 'widgets/molecules'
import { plural, pluralize, type IPluralForms } from 'widgets/utils'
import { ProfileForm, TelegramLinkPrompt } from 'widgets/organisms'
import { AccountTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { ACCOUNT_NAVIGATION } from '@/layouts/accountNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { messageForError } from '@/services/apiErrors'
import { getAccountDeletion } from '@/services/endpoints/auth'
import { accountDeletionKey } from '@/services/swrKeys'
import { publicConfig } from '@/сonfig'
import { useLoginHref } from '@/hooks/useLoginHref'

/**
 * Профиль: имя, номер, привязка Telegram, выход.
 *
 * Менять можно только имя — `PATCH /users/me` другого и не принимает.
 * Привязка Telegram здесь же, потому что это единственный экран, куда
 * человек вернётся, если не довёл её до конца при регистрации.
 *
 * Удаление аккаунта тоже здесь и больше нигде: это единственная страница,
 * которая принадлежит человеку целиком, и единственный способ отозвать
 * согласие на обработку данных (`pages/privacy.tsx`).
 *
 * Можно ли удаляться прямо сейчас — спрашивается у бэка (`GET /users/me/deletion`),
 * а не считается здесь по списку заявок: правило одно, и живёт оно там, где его
 * применяют. Своя копия на клиенте рано или поздно разошлась бы с ней, и
 * разошлась бы молча.
 */
/** «Сначала закройте 2 заявки» — винительный падеж, число подставляет `pluralize`. */
const ORDER_FORMS: IPluralForms = ['заявку', 'заявки', 'заявок']

/** «товар по этой заявке / по этим заявкам уже куплен» — числа в строке нет, оно рядом списком. */
const ORDER_REFERENCE_FORMS: IPluralForms = ['этой заявке', 'этим заявкам', 'этим заявкам']

const AccountPage: React.FC = () => {
  const router = useRouter()
  const { user, isLoading, isAdmin, updateProfile, logout, deleteAccount } = useAuth()
  const loginHref = useLoginHref()
  const { confirm } = useConfirm()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  /*
    Отдельно от `error`: тот уходит в `ProfileForm` и показывается у поля имени,
    наверху формы, — а кнопка удаления стоит в самом низу, в подвале. На узком
    экране отказ оказывался за пределами видимого, и нажатие выглядело так,
    будто ничего не произошло.
  */
  const [deleteError, setDeleteError] = useState<string | null>(null)
  /** Аккаунт удалён: вместо формы — прощание, см. `handleDelete`. */
  const [isDeleted, setIsDeleted] = useState(false)

  /*
    Запрашивается только для вошедшего и только на этой странице: ответ нужен
    ровно одной кнопке. Администраторам не запрашивается вовсе — кнопки у них
    нет, и спрашивать не о чем.
  */
  const {
    data: deletion,
    error: deletionError,
    mutate: reloadDeletion,
  } = useSWR(user !== null && !isAdmin ? accountDeletionKey(user.id) : null, getAccountDeletion)

  const blockingOrders = deletion?.blockingOrders ?? []
  /*
    Три разных «нельзя», и раньше они были одним: пока ответа нет, `data` равна
    `undefined` и при загрузке, и при сбое запроса, — так что упавший запрос
    навсегда оставлял кнопку с надписью «Проверяем». SWR повторяет попытку сам,
    но сказать об этом человеку должен интерфейс, а не молчание.

    Ошибка не открывает кнопку: правило считает бэкенд, и, не зная ответа,
    предложить удаление значит пустить человека в подтверждение вслепую — с
    возможным 409 уже после него.
  */
  const deletionBlockedReason =
    deletionError !== undefined
      ? 'Не удалось проверить, можно ли удалить аккаунт. Обновите страницу'
      : deletion === undefined
        ? 'Проверяем, можно ли удалить аккаунт'
        : deletion.isDeletable
          ? null
          : `Сначала закройте ${pluralize(blockingOrders.length, ORDER_FORMS)}: ${blockingOrders.map(orderNumber).join(', ')}`

  const handleSubmit = async (name: string): Promise<void> => {
    setIsSubmitting(true)
    setError(null)
    setIsSaved(false)

    try {
      await updateProfile(name)
      setIsSaved(true)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'account.save'))
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Удаление аккаунта — через ту же модалку, что и опасные действия админки
   * (`useConfirm`), а не через свою: подтверждение необратимого здесь ровно
   * одно и то же, а нативный `window.confirm` не стилизуется и на мобильных
   * показывает адрес страницы.
   *
   * Текст перечисляет последствия целиком, включая отмену ещё не подтверждённых
   * заявок: это единственный момент, когда человека можно об этом предупредить
   * до нажатия.
   *
   * После удаления — не редирект, а прощальный экран на этом же месте
   * (`isDeleted`). Молчаливый переезд в каталог неотличим от сбоя: человек
   * нажал необратимое и оказался на витрине, ничего про это не узнав. Уходит
   * он сам, прочитав, что именно стёрто, — так же, как экран успеха после
   * отправки заявки (`pages/checkout.tsx`) никуда не уводит.
   */
  const handleDelete = async (): Promise<void> => {
    const confirmed = await confirm({
      title: 'Удалить аккаунт?',
      description:
        'Номер, имя и привязка к боту будут стёрты, корзина и избранное - удалены, ' +
        'а заявки, ожидающие подтверждения, отменены: мы перестанем закупать ' +
        'по ним товар. Отменить это нельзя. Вернуться можно будет только заведя ' +
        'аккаунт заново.',
      confirmLabel: 'Удалить аккаунт',
    })

    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deleteAccount()
      setIsDeleted(true)
    } catch (cause: unknown) {
      setDeleteError(messageForError(cause, 'account.delete'))
      /*
        Перечитываем право на удаление: самая вероятная причина отказа — заявку
        подтвердили, пока страница была открыта. Тогда ответ приедет с её
        номером, кнопка станет недоступной и объяснит, почему, — вместо одной
        строки ошибки над той же рабочей кнопкой.
      */
      void reloadDeletion()
      // Только в ошибке: на успехе кнопки уже нет — на её месте прощание.
      setIsDeleting(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true)

    try {
      await logout()
      await router.push('/catalog')
    } catch (cause: unknown) {
      // Без этого падение запроса уходило в unhandled rejection: редиректа нет,
      // ошибки не видно, и единственным следом остаётся консоль.
      setError(messageForError(cause, 'account.logout'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  const content = (): React.ReactNode => {
    /*
      Раньше загрузки и раньше гостя — намеренно: удаление снимает сессию, и
      сразу после него `user` равен `null`. Без этой ветки на месте формы
      оказалось бы «Профиль виден после входа» — приглашение войти в аккаунт,
      которого только что не стало.

      Последствия названы ещё раз, теперь в прошедшем времени: подтверждение
      человек читал до нажатия и мог не запомнить, а другого экрана, где об
      этом сказать, больше не будет.
    */
    if (isDeleted) {
      return (
        <EmptyState
          title="Аккаунт удалён"
          description="Номер, имя и привязка к боту стёрты, корзина и избранное - удалены, заявки, ожидавшие подтверждения, отменены. Согласие на обработку данных отозвано. Вернуться можно, заведя аккаунт заново."
          action={
            <Button link={{ href: '/catalog' }} isFullWidth="mobile">
              В каталог
            </Button>
          }
        />
      )
    }

    /*
      Скелетон в раскладке формы: спиннер сменился бы блоком другой высоты.
      Обработчик тот же самый — в этом состоянии формы ещё нет и нажимать
      нечего, а заводить ради него пустышку смысла нет.
    */
    if (isLoading) {
      return (
        <ProfileForm
          user={null}
          isLoading={true}
          onSubmit={name => {
            void handleSubmit(name)
          }}
        />
      )
    }

    if (user === null) {
      return (
        <EmptyState
          title="Профиль виден после входа"
          description="Войдите - и здесь можно будет поправить имя и привязать Telegram"
          action={
            <Button link={{ href: loginHref }} isFullWidth="mobile">
              Войти
            </Button>
          }
        />
      )
    }

    return (
      <>
        {/*
          `key` по id: при смене аккаунта форма пересоздаётся, и в поле не
          остаётся имя предыдущего пользователя.
        */}
        <ProfileForm
          key={user.id}
          user={user}
          onSubmit={name => {
            void handleSubmit(name)
          }}
          isSubmitting={isSubmitting}
          error={error}
          isSaved={isSaved}
          footer={
            <>
              <Text size="sm" tone="muted">
                Выход завершает сессию на этом устройстве. Корзина и заявки сохранятся.
              </Text>

              <Button
                variant="secondary"
                isFullWidth="mobile"
                isLoading={isLoggingOut}
                onClick={() => {
                  void handleLogout()
                }}
              >
                Выйти из аккаунта
              </Button>

              {/*
                Админам удаление недоступно — обеим ролям, — и кнопки у них нет
                вовсе: бэкенд откажет (`account_not_deletable`), а кнопка, которая
                всегда возвращает ошибку, хуже отсутствующей.

                Удаление — право покупателя на свои данные; доступ в админку выдаёт
                владелец, и отказываться от него кнопкой в профиле не то же самое,
                что уйти из магазина. Сначала владелец снимает роль — потом аккаунт
                удаляется, как любой другой.
              */}
              {!isAdmin && (
                <>
                  {/*
                    Черта перед удалением — не украшение: без неё «Выйти» и «Удалить»
                    стоят двумя соседними кнопками, а промахнуться между ними стоит
                    аккаунта. Модалка ловит такой промах, черта делает его реже.
                  */}
                  <Divider />

                  {blockingOrders.length > 0 ? (
                    /*
                      Отказ объясняется до нажатия, а не после: заявка,
                      подтверждённая или собранная, — это уже купленный товар,
                      который человеку ещё отдавать, и удаляться посреди этого
                      нельзя. Номера названы, потому что «закройте заявки» без
                      них отправляет искать, какие именно.

                      «Заберите или попросите владельца», а не «отмените»: сам
                      покупатель такую заявку отменить не может — `is_editable` на
                      бэке требует PENDING, и кнопки отмены на ней уже нет. Совет
                      сделать невозможное хуже, чем отсутствие совета.
                    */
                    <Text size="sm" tone="muted">
                      {`Сейчас аккаунт удалить нельзя: товар по ${plural(blockingOrders.length, ORDER_REFERENCE_FORMS)} уже куплен - `}
                      {blockingOrders.map(orderNumber).join(', ')}
                      {'. '}
                      <AppLink href="/orders">Заберите товары</AppLink>
                      {' или попросите нас изменить их статус - и удаление станет доступно.'}
                    </Text>
                  ) : (
                    <Text size="sm" tone="muted">
                      Удаление стирает номер, имя и привязку к боту, отменяет заявки, ожидающие
                      подтверждения, и отзывает согласие на обработку данных.
                    </Text>
                  )}

                  {/*
                    `unavailableReason`, а не `disabled`: кнопка остаётся в
                    табуляции и объясняет отказ тому, кто дошёл до неё с
                    клавиатуры. Пока ответ не приехал (`deletion === undefined`)
                    — тоже недоступна: нажатие в этот момент ушло бы вслепую и
                    вернулось 409 уже после подтверждения.
                  */}
                  <Button
                    variant="danger"
                    isFullWidth="mobile"
                    isLoading={isDeleting}
                    unavailableReason={deletionBlockedReason}
                    onClick={() => {
                      void handleDelete()
                    }}
                  >
                    Удалить аккаунт
                  </Button>

                  {deleteError !== null && <Alert tone="danger">{deleteError}</Alert>}
                </>
              )}
            </>
          }
        />

        <TelegramLinkPrompt
          botUsername={publicConfig('telegramBotUsername')}
          isLinked={user.telegramLinked}
        />
      </>
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Профиль - Sululu</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AccountTemplate
        title="Профиль"
        summary="Имя видим мы, когда собираем заказ по вашей заявке"
        navigation={ACCOUNT_NAVIGATION}
        currentHref="/account"
      >
        {content()}
      </AccountTemplate>
    </SiteLayout>
  )
}

export default AccountPage
