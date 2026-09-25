import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import clsx from 'clsx'
import {
  type FC,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { IBasicStyling, IRichTextEditorProps } from '../../types'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import {
  IconBold,
  IconHeading,
  IconItalic,
  IconLink,
  IconListBullets,
  IconListNumbers,
} from '../../svg/icons'
import { normalizeLinkHref } from '../../utils/richText'
import * as styles from './RichTextEditor.css'

/**
 * Поле описания товара с оформлением — Tiptap (ProseMirror) под панелью кнопок.
 *
 * Набор кнопок короткий намеренно и совпадает со списком тегов на бэкенде
 * (`catalog/rich_text.py`) и в `RichText`: абзац, жирный, курсив,
 * подзаголовок, два вида списков и ссылка. Всё, что StarterKit умеет сверх
 * этого (цитаты, код, зачёркивание, подчёркивание, линия), выключено:
 * сохранить его бэкенд всё равно бы не дал, и владелец видел бы в редакторе
 * то, чего потом нет на сайте. Цвета и шрифта нет совсем — внешний вид
 * описания задаёт сайт, а не товар.
 *
 * Вставка из Word или с сайта бренда разбирается той же схемой: лишнее
 * отпадает ещё в редакторе, до сохранения.
 *
 * Счётчик считает видимые символы — `textContent` документа, без разметки и
 * без переносов между абзацами. Ровно так считает бэкенд, иначе форма
 * пропускала бы то, что сервер потом отвергнет. Лимит не режет ввод, как
 * `maxLength` у `Textarea`: у встроенного в Tiptap счётчика обрезка молча
 * съедает начало текста при загрузке, а здесь описание, набранное до
 * редактора, могло оказаться длиннее. Поэтому превышение — ошибка у поля,
 * которую форма не даст отправить.
 *
 * Подпись связана с полем через `aria-labelledby`: `contenteditable` — не
 * `input`, и `<label htmlFor>` его не называет.
 */

/*
  Настройка — вне компонента: `useEditor` сравнивает расширения по ссылке, и
  список, собранный заново на каждый рендер, пересоздавал бы опции редактора
  на каждое нажатие клавиши.
*/
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      // `target` не нужен: ссылка из описания открывается в той же вкладке,
      // а `rel` бэкенд всё равно проставит свой.
      HTMLAttributes: { target: null, rel: null },
    },
  }),
]

interface IToolbarButtonProps {
  label: string
  icon: ReactNode
  isActive: boolean
  disabled: boolean
  onClick: () => void
}

const ToolbarButton: FC<IToolbarButtonProps> = ({ label, icon, isActive, disabled, onClick }) => (
  <button
    type="button"
    className={styles.toolButton}
    aria-label={label}
    aria-pressed={isActive}
    title={label}
    disabled={disabled}
    // Кнопка не забирает фокус у текста: иначе выделение, к которому
    // применяется оформление, гасло бы на нажатии.
    onMouseDown={event => event.preventDefault()}
    onClick={onClick}
  >
    {icon}
  </button>
)

export const RichTextEditor: FC<IRichTextEditorProps & IBasicStyling> = ({
  value,
  onChange,
  id,
  label,
  hint,
  error,
  maxLength,
  disabled = false,
  className,
}) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const labelId = `${fieldId}-label`
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const linkInputId = `${fieldId}-link`
  const hasError = error !== undefined && error !== null && error !== ''

  const describedBy =
    [hasError ? errorId : null, hint !== undefined ? hintId : null].filter(Boolean).join(' ') ||
    undefined

  /*
    Колбэки Tiptap регистрирует один раз, при создании редактора, — свежий
    `onChange` до него доходит только через ref.
  */
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Стартовое содержимое — только стартовое: дальше документ живёт в редакторе.
  const [initialContent] = useState(value)

  const editorProps = useMemo(
    () => ({
      attributes: {
        id: fieldId,
        class: styles.content,
        role: 'textbox',
        'aria-multiline': 'true',
        ...(label !== undefined && { 'aria-labelledby': labelId }),
        ...(describedBy !== undefined && { 'aria-describedby': describedBy }),
        'aria-invalid': String(hasError),
      },
    }),
    [fieldId, label, labelId, describedBy, hasError]
  )

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initialContent,
    editable: !disabled,
    // Админка рендерится и на сервере: без этого Tiptap строит документ до
    // гидрации и разметка сервера с клиентом расходится.
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps,
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.isEmpty ? '' : current.getHTML())
    },
  })

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current === null
        ? null
        : {
            length: current.state.doc.textContent.length,
            isBold: current.isActive('bold'),
            isItalic: current.isActive('italic'),
            isHeading: current.isActive('heading', { level: 2 }),
            isBulletList: current.isActive('bulletList'),
            isOrderedList: current.isActive('orderedList'),
            isLink: current.isActive('link'),
            href: (current.getAttributes('link').href as string | undefined) ?? '',
          },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  /*
    Значение снаружи поменялось не из-за ввода (форму открыли на другом
    товаре, сбросили) — документ подтягивается. Своё же `onChange`, вернувшись
    пропсом, сюда не проходит: HTML совпадает с тем, что в редакторе.
  */
  useEffect(() => {
    if (editor === null || editor.isDestroyed) {
      return
    }

    const current = editor.isEmpty ? '' : editor.getHTML()

    if (value !== current) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value])

  const [isLinkOpen, setIsLinkOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (isLinkOpen) {
      document.getElementById(linkInputId)?.focus()
    }
  }, [isLinkOpen, linkInputId])

  const openLink = (): void => {
    setLinkDraft(state?.href ?? '')
    setLinkError(null)
    setIsLinkOpen(true)
  }

  const closeLink = (): void => {
    setIsLinkOpen(false)
    editor?.commands.focus()
  }

  const applyLink = (): void => {
    if (editor === null) {
      return
    }

    if (linkDraft.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setIsLinkOpen(false)
      return
    }

    const href = normalizeLinkHref(linkDraft)

    if (href === null) {
      setLinkError('Адрес сайта, почта или телефон: например, brand.com')
      return
    }

    /*
      Без выделения ссылке не к чему прицепиться — тогда вставляется сам
      адрес, уже ссылкой. Иначе кнопка молча ничего бы не делала.
    */
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: linkDraft.trim(),
          marks: [{ type: 'link', attrs: { href } }],
        })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }

    setIsLinkOpen(false)
  }

  const removeLink = (): void => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setIsLinkOpen(false)
  }

  /*
    Enter в поле адреса иначе отправил бы всю форму товара — поле стоит
    внутри неё, а вложенной формы HTML не позволяет.
  */
  const handleLinkKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      applyLink()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      closeLink()
    }
  }

  const isToolDisabled = disabled || editor === null
  const length = state?.length ?? 0
  const isOverLimit = maxLength !== undefined && length > maxLength

  return (
    <div className={clsx(styles.container, className)}>
      {label !== undefined && (
        <span
          className={styles.label}
          id={labelId}
          // Щелчок по подписи ставит курсор в поле — как у настоящего `<label>`.
          onClick={() => editor?.commands.focus()}
        >
          {label}
        </span>
      )}

      <div
        className={clsx(
          styles.frame,
          (hasError || isOverLimit) && styles.invalid,
          disabled && styles.disabled
        )}
      >
        <div
          className={styles.toolbar}
          role="toolbar"
          aria-label="Оформление текста"
          aria-controls={fieldId}
        >
          <ToolbarButton
            label="Жирный (Ctrl+B)"
            icon={<IconBold />}
            isActive={state?.isBold ?? false}
            disabled={isToolDisabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="Курсив (Ctrl+I)"
            icon={<IconItalic />}
            isActive={state?.isItalic ?? false}
            disabled={isToolDisabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <span className={styles.separator} aria-hidden />
          <ToolbarButton
            label="Подзаголовок"
            icon={<IconHeading />}
            isActive={state?.isHeading ?? false}
            disabled={isToolDisabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            label="Список"
            icon={<IconListBullets />}
            isActive={state?.isBulletList ?? false}
            disabled={isToolDisabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="Нумерованный список"
            icon={<IconListNumbers />}
            isActive={state?.isOrderedList ?? false}
            disabled={isToolDisabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />
          <span className={styles.separator} aria-hidden />
          <ToolbarButton
            label="Ссылка"
            icon={<IconLink />}
            isActive={isLinkOpen || (state?.isLink ?? false)}
            disabled={isToolDisabled}
            onClick={isLinkOpen ? closeLink : openLink}
          />
        </div>

        {isLinkOpen && (
          <div className={styles.linkRow}>
            <Input
              className={styles.linkInput}
              id={linkInputId}
              ariaLabel="Адрес ссылки"
              placeholder="brand.com"
              inputMode="url"
              autoComplete="off"
              value={linkDraft}
              error={linkError}
              onChange={next => {
                setLinkDraft(next)
                setLinkError(null)
              }}
              onKeyDown={handleLinkKeyDown}
            />
            <Button size="sm" onClick={applyLink}>
              Готово
            </Button>
            {state?.isLink === true && (
              <Button size="sm" variant="ghost" onClick={removeLink}>
                Убрать
              </Button>
            )}
          </div>
        )}

        <EditorContent editor={editor} className={styles.body} />
      </div>

      <div className={styles.footer}>
        {hasError ? (
          <span className={styles.error} id={errorId} role="alert">
            {error}
          </span>
        ) : (
          hint !== undefined && (
            <span className={styles.hint} id={hintId}>
              {hint}
            </span>
          )
        )}

        {maxLength !== undefined && (
          <span className={clsx(styles.counter, isOverLimit && styles.counterOver)}>
            {`${length} / ${maxLength}`}
          </span>
        )}
      </div>
    </div>
  )
}
