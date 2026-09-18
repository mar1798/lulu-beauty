import React, { useState } from 'react'
import { mutate as globalMutate } from 'swr'
import type { IImportSummary } from 'widgets/types'
import { AdminImportPanel } from 'widgets/organisms'
import { useToast } from 'widgets/contexts'
import { AdminShell } from '@/layouts/AdminShell'
import { saveBlob } from '@/services/api'
import { messageForError } from '@/services/apiErrors'
import { importCatalog } from '@/services/endpoints/admin'
import { downloadCatalogExport } from '@/services/endpoints/export'
import { SHOWCASE_PATHS, refreshPublicPages } from '@/services/endpoints/revalidate'
import { categoriesKey, isAdminBrandsKey, isAdminProductsKey } from '@/services/swrKeys'

/**
 * Импорт каталога из xlsx/csv.
 *
 * Ответ приходит успешным даже когда разобрать не удалось ничего: импорт
 * частичный, и разбор ошибок — часть нормального результата. Поэтому здесь
 * нет ветки «успех/провал»: есть итог и есть ошибка запроса, и панель
 * показывает то, что пришло.
 *
 * Выгрузка каталога живёт на этой же странице: лист у неё в том же формате,
 * который читает импорт, так что «выгрузить — поправить в Excel — залить
 * обратно» проходит целиком здесь, не уводя владельца никуда ещё.
 */

/** Номер строки `0` в `errors` означает отказ по всему файлу, а не по строке. */
const WHOLE_FILE_ROW = 0
const AdminImportPage: React.FC = () => {
  const { notify } = useToast()
  const [isImporting, setIsImporting] = useState(false)
  const [summary, setSummary] = useState<IImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleImport = async (file: File): Promise<void> => {
    setIsImporting(true)
    setError(null)
    setSummary(null)

    try {
      const result = await importCatalog(file)

      setSummary(result)
      /*
        Только витрина: импорт меняет разом сотни товаров, и перечислять их
        страницы значило бы пересобрать весь каталог одним запросом. Карточки
        догонят сами — `revalidate: 60` для того и остался.
      */
      refreshPublicPages(...SHOWCASE_PATHS)
      // Импорт может завести категории и поменять любой товар разом — точечно не угадать.
      void globalMutate(categoriesKey)
      void globalMutate(isAdminProductsKey)
      // Импорт создаёт и бренды: файл с колонкой `brand` приносит спелления,
      // которых в фильтре и подсказках ещё нет.
      void globalMutate(isAdminBrandsKey)

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
              description: 'Ни одна строка не применена — подробности ниже',
            }
          : {
              tone: result.errors.length === 0 ? 'success' : 'info',
              title: 'Импорт завершён',
              description: `Создано ${result.created}, обновлено ${result.updated}`,
            }
      )
    } catch (cause: unknown) {
      const message = messageForError(cause, 'admin.import')

      setError(message)
      notify({ tone: 'danger', title: 'Импорт не выполнен', description: message })
    } finally {
      setIsImporting(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    setIsExporting(true)
    setExportError(null)

    try {
      saveBlob(await downloadCatalogExport(), 'catalog.xlsx')
    } catch (cause: unknown) {
      const message = messageForError(cause, 'admin.export.catalog')

      setExportError(message)
      notify({ tone: 'danger', title: 'Выгрузка не выполнена', description: message })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <AdminShell
      title="Импорт и выгрузка каталога"
      summary="Товары сопоставляются по slug: знакомый обновляется, новый создаётся"
    >
      <AdminImportPanel
        isImporting={isImporting}
        summary={summary}
        error={error}
        onImport={file => {
          void handleImport(file)
        }}
        isExporting={isExporting}
        exportError={exportError}
        onExport={() => {
          void handleExport()
        }}
      />
    </AdminShell>
  )
}

export default AdminImportPage
