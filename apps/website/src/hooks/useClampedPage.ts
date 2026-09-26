import { useEffect } from 'react'
import type { IPage } from 'widgets/types'

/**
 * Возврат на последнюю существующую страницу списка, когда текущая опустела.
 *
 * Владелец удаляет последнюю строку на последней странице (или меняет статус так,
 * что заявка уходит из фильтра) — и остаётся на пустой странице с «Ничего не
 * нашлось», хотя на предыдущих всё на месте. Общий для трёх списков админки:
 * заявок, товаров и пользователей.
 *
 * Сверка по `data.page`: с `keepPreviousData` на экране может стоять выдача
 * прошлой страницы, и решать по ней нельзя.
 */
export const useClampedPage = (
  data: IPage<unknown> | undefined,
  page: number,
  goToPage: (page: number) => void
): void => {
  useEffect(() => {
    if (data === undefined || data.page !== page || data.items.length > 0 || page <= 1) {
      return
    }

    const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize))

    if (lastPage < page) {
      goToPage(lastPage)
    }
  }, [data, page, goToPage])
}
