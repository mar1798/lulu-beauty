import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminImportPanelProps, IBasicStyling } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Heading } from '../../atoms/heading'
import { Spinner } from '../../atoms/spinner'
import { Text } from '../../atoms/text'
import { FileDropzone } from '../../molecules/file-dropzone'
import { IconDownload } from '../../svg/icons'
import { plural } from '../../utils/plural'
import * as styles from './AdminImportPanel.css'

/**
 * Импорт каталога из xlsx/csv.
 *
 * Ошибки приходят двумя разными путями, и панель обязана показывать оба.
 * Ошибки строк — внутри успешного ответа (`summary.errors`), потому что
 * импорт частичный: хорошие строки применяются, плохие перечисляются.
 * Ошибка всего файла (не UTF-8, битый xlsx, чужое расширение) приходит там
 * же, но с номером строки `0` — она про файл целиком, и подписывать её
 * «строка 0» нельзя. Ошибка запроса (413, 500) приходит пропсом `error`.
 *
 * Выгрузка живёт здесь же, а не на отдельной странице, потому что это один
 * круг: выгрузить каталог, поправить цены в Excel, залить файл обратно —
 * колонки у листа ровно те, что перечислены выше.
 */

const WHOLE_FILE_ROW = 0

const IMPORT_MAX_BYTES = 10 * 1024 * 1024
const IMPORT_EXTENSIONS = ['.xlsx', '.xlsm', '.csv']

export const AdminImportPanel: FC<IAdminImportPanelProps & IBasicStyling> = ({
  onImport,
  isImporting = false,
  summary,
  error,
  onExport,
  isExporting = false,
  exportError,
  className,
}) => {
  const fileErrors = (summary?.errors ?? []).filter(item => item.row === WHOLE_FILE_ROW)
  const rowErrors = (summary?.errors ?? []).filter(item => item.row !== WHOLE_FILE_ROW)
  const isEmptyResult =
    summary != null && summary.created === 0 && summary.updated === 0 && summary.errors.length === 0

  return (
    <div className={clsx(styles.container, className)}>
      <section className={styles.panel}>
        <Heading level={2} size="sm">
          Файл каталога
        </Heading>

        <Text tone="secondary" size="sm">
          Обязательные колонки: <code className={styles.code}>name</code>,{' '}
          <code className={styles.code}>slug</code>, <code className={styles.code}>price</code>.
          Необязательные: <code className={styles.code}>brand</code>,{' '}
          <code className={styles.code}>description</code>,{' '}
          <code className={styles.code}>category</code> (слаг или название),{' '}
          <code className={styles.code}>volume</code> (объём в мл),{' '}
          <code className={styles.code}>inStock</code>. Товар с уже существующим slug обновляется,
          новый — создаётся; незнакомая категория заводится сама.
        </Text>

        {/*
          Главное, чего не понять из списка колонок: строка — это объём, а не
          товар. Без этой фразы владелец не догадается, как завести второй
          объём файлом, и будет плодить товары с разными slug.
        */}
        <Text tone="secondary" size="sm">
          Строка — это <b>объём</b>, а не товар: чтобы продавать одно и то же в 30 и 50 мл,
          поставьте две строки с одним <code className={styles.code}>slug</code> и разным{' '}
          <code className={styles.code}>volume</code> — у каждой своя цена и своё наличие. Объёмы,
          которых в файле нет, остаются как были: снять объём можно в карточке товара. Файл без
          колонки <code className={styles.code}>volume</code> — обычный прайс: он меняет цену там,
          где объём у товара один.
        </Text>

        <FileDropzone
          label="Файл xlsx или csv"
          accept=".xlsx,.xlsm,.csv"
          allowedExtensions={IMPORT_EXTENSIONS}
          maxBytes={IMPORT_MAX_BYTES}
          hint="До 10 МБ. Первая строка — заголовки колонок."
          disabled={isImporting}
          buttonLabel="Выбрать файл"
          onSelect={onImport}
        />

        {isImporting && <Spinner label="Импортируем каталог" />}

        {error !== undefined && error !== null && (
          <Alert tone="danger" title="Импорт не выполнен">
            {error}
          </Alert>
        )}
      </section>

      {onExport !== undefined && (
        <section className={styles.panel}>
          <Heading level={2} size="sm">
            Выгрузка каталога
          </Heading>

          <Text tone="secondary" size="sm">
            Все товары в xlsx с теми же колонками, что читает импорт, — файл можно поправить в Excel
            и залить обратно сюда же. Колонок <code className={styles.code}>description</code> и
            фотографий в листе нет: и описания, и снимки при обратной загрузке останутся как есть —
            они правятся в карточке товара.
          </Text>

          <Button
            variant="secondary"
            iconStart={<IconDownload />}
            isLoading={isExporting}
            onClick={onExport}
          >
            Выгрузить в Excel
          </Button>

          {exportError !== undefined && exportError !== null && (
            <Alert tone="danger" title="Выгрузка не выполнена">
              {exportError}
            </Alert>
          )}
        </section>
      )}

      {summary != null && (
        <section className={styles.panel} aria-live="polite">
          <Heading level={2} size="sm">
            Результат
          </Heading>

          {fileErrors.length > 0 ? (
            <Alert tone="danger" title="Файл не удалось разобрать">
              {fileErrors.map(item => item.message).join('; ')}
            </Alert>
          ) : (
            <div className={styles.totals}>
              <span className={styles.total}>
                <span className={styles.totalValue}>{summary.created}</span>
                <span className={styles.totalLabel}>
                  {plural(summary.created, ['создан', 'создано', 'создано'])}
                </span>
              </span>

              <span className={styles.total}>
                <span className={styles.totalValue}>{summary.updated}</span>
                <span className={styles.totalLabel}>
                  {plural(summary.updated, ['обновлён', 'обновлено', 'обновлено'])}
                </span>
              </span>

              <span className={styles.total}>
                <span className={styles.totalValue}>{rowErrors.length}</span>
                <span className={styles.totalLabel}>
                  {plural(rowErrors.length, ['ошибка', 'ошибки', 'ошибок'])}
                </span>
              </span>
            </div>
          )}

          {isEmptyResult && (
            <Text tone="secondary" size="sm">
              В файле не нашлось ни одной строки с данными
            </Text>
          )}

          {rowErrors.length > 0 && (
            <div className={styles.errorsWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.headCell} scope="col">
                      Строка
                    </th>
                    <th className={styles.headCell} scope="col">
                      Что не так
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowErrors.map(item => (
                    <tr key={`${item.row}-${item.message}`}>
                      <td className={styles.rowCell}>{item.row}</td>
                      <td className={styles.cell}>{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
