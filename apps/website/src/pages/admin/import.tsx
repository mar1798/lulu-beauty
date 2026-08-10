import React, { useState } from 'react'
import type { GetServerSideProps } from 'next'
import { mutate as globalMutate } from 'swr'
import type { IImportSummary } from 'widgets/types'
import { AdminImportPanel } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { requireAdmin, type IAdminPageProps } from '@/server/adminGate'
import { isApiError } from '@/services/apiErrors'
import { importCatalog } from '@/services/endpoints/admin'
import { categoriesKey, isAdminProductsKey } from '@/services/swrKeys'

/**
 * Импорт каталога из xlsx/csv.
 *
 * Ответ приходит успешным даже когда разобрать не удалось ничего: импорт
 * частичный, и разбор ошибок — часть нормального результата. Поэтому здесь
 * нет ветки «успех/провал»: есть итог и есть ошибка запроса, и панель
 * показывает то, что пришло.
 */

/** Номер строки `0` в `errors` означает отказ по всему файлу, а не по строке. */
const WHOLE_FILE_ROW = 0
const AdminImportPage: React.FC<IAdminPageProps> = () => {
  const { notify } = useToast()
  const [isImporting, setIsImporting] = useState(false)
  const [summary, setSummary] = useState<IImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async (file: File): Promise<void> => {
    setIsImporting(true)
    setError(null)
    setSummary(null)

    try {
      const result = await importCatalog(file)

      setSummary(result)
      // Импорт может завести категории и поменять любой товар разом — точечно не угадать.
      void globalMutate(categoriesKey)
      void globalMutate(isAdminProductsKey)

      /*
        Ошибка с номером строки `0` — это отказ по всему файлу (не UTF-8,
        битый xlsx, чужое расширение). Ответ при этом успешный, поэтому без
        отдельной ветки тост бодро сообщал бы «Импорт завершён, создано 0».
      */
      const isFileRejected = result.errors.some(item => item.row === WHOLE_FILE_ROW)

      notify(
        isFileRejected
          ? {
              tone: 'danger',
              title: 'Файл не разобран',
              description: 'Ни одна строка не применена — подробности ниже.',
            }
          : {
              tone: result.errors.length === 0 ? 'success' : 'info',
              title: 'Импорт завершён',
              description: `Создано ${result.created}, обновлено ${result.updated}.`,
            }
      )
    } catch (cause: unknown) {
      const message = isApiError(cause) ? cause.message : 'Не удалось импортировать файл.'

      setError(message)
      notify({ tone: 'danger', title: 'Импорт не выполнен', description: message })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <AdminShell
      title="Импорт каталога"
      summary="Товары сопоставляются по slug: знакомый обновляется, новый создаётся."
    >
      <AdminImportPanel
        isImporting={isImporting}
        summary={summary}
        error={error}
        onImport={file => {
          void handleImport(file)
        }}
      />
    </AdminShell>
  )
}

export const getServerSideProps: GetServerSideProps<IAdminPageProps> = async context => {
  const gate = await requireAdmin<IAdminPageProps>(context)

  return gate.redirect ?? { props: { user: gate.user } }
}

export default AdminImportPage
