import { createNativeChatPastedTextHistory } from './native-chat-pasted-text-history'
import { resolveNativeChatPastedText } from './native-chat-composer-pasted-text-references'
import { NativeChatPastedTextScopeProvider } from './native-chat-pasted-text-state'
import { writeNativeChatDraftDocument } from './native-chat-draft-cache'
import {
  subscribeToNativeChatComposerDraft,
  hasUnsavedNativeChatComposerDraftChange
} from './native-chat-composer-draft-store'
import { closeHistory } from '@tiptap/pm/history'
import { Slice } from '@tiptap/pm/model'
import {
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type RefObject
} from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import {
  fileReferenceContent,
  NativeChatFileReference,
  NativeChatImageReference,
  NativeChatSkill,
  promptLeafText,
  promptText,
  promptTextContent
} from './native-chat-prompt-document'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { NativeChatImageRowProvider } from './NativeChatImageReferencePill'
import { useAppStore } from '@/store'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import {
  initialPromptContent,
  promptModeCoordinates,
  promptModeExtensions,
  replacePromptDocument,
  storedPromptDocument
} from './native-chat-prompt-editor-mode'

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'onSelect'> & {
  scopeKey?: string
  /** The composer's thumbnail ids, in order, which number its image chips. */
  imageRow?: readonly string[]
  inputRef: RefObject<NativeChatComposerInput | null>
  initialValue: string
  disabled: boolean
  placeholder: string
  onChange: (input: NativeChatComposerInput) => void
  onSelect: (input: NativeChatComposerInput) => void
}

const NO_IMAGES: readonly string[] = []

export function NativeChatPromptEditor({
  scopeKey,
  imageRow = NO_IMAGES,
  inputRef,
  initialValue,
  disabled,
  placeholder,
  onChange,
  onSelect,
  className,
  ...events
}: Props): React.JSX.Element {
  const historyPaths = useMemo(() => createNativeChatPastedTextHistory(scopeKey ?? ''), [scopeKey])
  const placeholderRef = useRef(placeholder)
  placeholderRef.current = placeholder
  const initialValueRef = useRef(initialValue)
  initialValueRef.current = initialValue
  const markdown = useAppStore((state) => state.settings?.nativeChatMarkdownComposer === true)
  const codec = useMemo(() => createRichMarkdownEditorCodec(), [])
  const extensions = useMemo(
    () => [
      ...promptModeExtensions(markdown, codec),
      NativeChatSkill,
      NativeChatFileReference,
      NativeChatImageReference,
      // A disabled box still says why it is disabled, as the plain text box's placeholder does.
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
        showOnlyWhenEditable: false
      })
    ],
    [codec, markdown]
  )
  const initial = useMemo(
    () => initialPromptContent(extensions, markdown, codec, scopeKey, initialValueRef.current),
    [codec, extensions, markdown, scopeKey]
  )
  const editor = useEditor(
    {
      extensions,
      content: initial.content,
      contentType: initial.contentType,
      editable: !disabled,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': placeholder,
          class: `${className ?? ''} ${markdown ? 'rich-markdown-editor native-chat-markdown-composer-editor' : ''} whitespace-pre-wrap break-words [&_p]:m-0 [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child]:before:text-chat-foreground-faint [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:pointer-events-none`,
          ...Object.fromEntries(Object.entries(events).filter(([key]) => key.startsWith('aria-')))
        },
        // Clipboard input is text, read as Markdown in that mode; only the picker and attachments
        // create pills.
        handlePaste: (view, event) => {
          if (event.defaultPrevented) {
            return true
          }
          const text = event.clipboardData?.getData('text/plain')
          if (text == null) {
            return false
          }
          const content = editor?.schema.nodeFromJSON(
            promptModeCoordinates(editor, markdown, codec).content(text)
          )
          if (!content) {
            return false
          }
          view.dispatch(view.state.tr.replaceSelection(new Slice(content.content, 1, 1)))
          return true
        },
        clipboardTextSerializer: (slice, view) =>
          resolveNativeChatPastedText(
            scopeKey ?? '',
            markdown && editor
              ? promptModeCoordinates(editor, markdown, codec).text(
                  view.state.schema.topNodeType.create(null, slice.content)
                )
              : slice.content.textBetween(0, slice.content.size, '\n', promptLeafText),
            true
          )
      },
      onTransaction: ({ editor: current, transaction }) => {
        const pastedTextFiles = transaction.docChanged
          ? historyPaths(current.state.doc, transaction.docs)
          : undefined
        // Why: a value set from the store with no change of this window behind it (another
        // window's draft, a late load) is already saved; saving it back would make it one. A
        // value this window just set keeps its document, skill chips included.
        if (
          scopeKey &&
          transaction.docChanged &&
          (!transaction.getMeta('preventUpdate') ||
            hasUnsavedNativeChatComposerDraftChange(scopeKey))
        ) {
          writeNativeChatDraftDocument(
            scopeKey,
            promptModeCoordinates(current, markdown, codec).text(current.state.doc),
            current.getJSON(),
            pastedTextFiles
          )
        }
      },
      onUpdate: () => {
        if (inputRef.current) {
          onChange(inputRef.current)
        }
      },
      onSelectionUpdate: () => {
        if (inputRef.current) {
          onSelect(inputRef.current)
        }
      }
    },
    [markdown]
  )

  const coordinates = useMemo(
    () => promptModeCoordinates(editor, markdown, codec),
    [codec, editor, markdown]
  )

  useLayoutEffect(() => {
    const value = initialValueRef.current
    if (editor && initial.stored && coordinates.text(editor.state.doc) !== value) {
      replacePromptDocument(editor, coordinates.content(value))
    }
  }, [coordinates, editor, initial.stored])

  useLayoutEffect(() => {
    if (!editor || !scopeKey) {
      return
    }
    const capture = () => historyPaths(editor.state.doc)
    capture()
    return subscribeToNativeChatComposerDraft(scopeKey, capture)
  }, [editor, scopeKey, historyPaths])

  useLayoutEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [disabled, editor])

  const input = useMemo<NativeChatComposerInput | null>(
    () =>
      editor
        ? {
            insertText: (text) => {
              const content = editor.schema.nodeFromJSON(coordinates.content(text))
              editor.view.dispatch(
                editor.state.tr.replaceSelection(new Slice(content.content, 1, 1))
              )
            },
            get value() {
              return coordinates.text(editor.state.doc)
            },
            set value(value: string) {
              const { doc } = editor.state
              const old = coordinates.text(doc)
              if (old === value) {
                return
              }
              // A draft loaded or adopted whole keeps its skill chips: its stored document wins.
              const stored = storedPromptDocument(editor, coordinates, scopeKey, value)
              if (stored) {
                editor.commands.setContent(stored, { emitUpdate: false })
                return
              }
              if (!value) {
                editor.commands.setContent(coordinates.content(''), { emitUpdate: false })
                return
              }
              let start = 0
              while (start < old.length && start < value.length && old[start] === value[start]) {
                start++
              }
              let end = 0
              while (
                end < old.length - start &&
                end < value.length - start &&
                old[old.length - 1 - end] === value[value.length - 1 - end]
              ) {
                end++
              }
              // A text replacement intersecting an atom replaces its entire serialized token.
              const from = coordinates.position(doc, start, 'before')
              const to = coordinates.position(doc, old.length - end, 'after')
              start = coordinates.offset(doc, from)
              end = old.length - coordinates.offset(doc, to)
              if (markdown) {
                // Markdown reads only as a whole: a change typed text cannot make is read whole.
                const inserted = value.slice(start, value.length - end)
                const tr = editor.state.tr.insertText(inserted, from, to)
                if (!inserted.includes('\n') && coordinates.text(tr.doc) === value) {
                  editor.view.dispatch(tr.setMeta('preventUpdate', true))
                } else {
                  editor.commands.setContent(coordinates.content(value), { emitUpdate: false })
                }
                return
              }
              const content = editor.schema.nodeFromJSON(
                promptTextContent(value.slice(start, value.length - end))
              )
              editor.commands.command(({ tr }) => {
                tr.replaceRange(from, to, new Slice(content.content, 1, 1))
                tr.setMeta('preventUpdate', true)
                return true
              })
            },
            get disabled() {
              return !editor.isEditable
            },
            set disabled(value: boolean) {
              editor.setEditable(!value)
            },
            get selectionStart() {
              return coordinates.offset(editor.state.doc, editor.state.selection.from)
            },
            get selectionEnd() {
              return coordinates.offset(editor.state.doc, editor.state.selection.to)
            },
            focus: () => {
              // Why: a blurred editor never writes its caret to the page, so focusing the element
              // alone would bring back the stale one and undo a caret moved by an insertion.
              editor.view.focus()
              if (!editor.isEditable) {
                editor.view.dom.focus()
              }
            },
            contains: (node) => editor.view.dom.contains(node),
            isCaretOnVisualEdge: (edge) => {
              const { selection, doc } = editor.state
              if (!selection.empty) {
                return false
              }
              const before = promptText(doc, 0, selection.from)
              const after = promptText(doc, selection.from)
              // An empty composer has one line: no layout read on the path every recall starts from.
              if (before === '' && after === '') {
                return true
              }
              const beyond = edge === 'start' ? before : after
              // Why both: the text check covers other paragraphs, the view covers soft wraps.
              return (
                !beyond.includes('\n') &&
                editor.view.endOfTextblock(edge === 'start' ? 'up' : 'down')
              )
            },
            select: () => {
              editor.commands.selectAll()
            },
            setSelectionRange: (from, to) => {
              const { doc } = editor.state
              editor.commands.setTextSelection({
                from: coordinates.position(doc, from ?? 0),
                to: coordinates.position(doc, to ?? 0)
              })
            },
            insertSkill: (from, to, token, path) => {
              const { doc } = editor.state
              const range = {
                from: coordinates.position(doc, from),
                to: coordinates.position(doc, to)
              }
              editor.view.dispatch(closeHistory(editor.state.tr))
              editor
                .chain()
                .insertContentAt(range, [
                  { type: 'nativeChatSkill', attrs: { token, path: path ?? '' } },
                  { type: 'text', text: ' ' }
                ])
                .run()
              editor.view.dispatch(closeHistory(editor.state.tr))
            },
            removeImageReferences: (attachmentId) => {
              const { tr } = editor.state
              editor.state.doc.descendants((node, position) => {
                if (
                  node.type.name === NativeChatImageReference.name &&
                  node.attrs.attachmentId === attachmentId
                ) {
                  // With the space inserted after it, so no gap is left where it sat.
                  const from = tr.mapping.map(position)
                  const to = from + node.nodeSize
                  tr.delete(from, tr.doc.textBetween(to, to + 1) === ' ' ? to + 1 : to)
                }
              })
              // Undo must not bring back a chip whose image is gone.
              if (tr.docChanged) {
                editor.view.dispatch(tr.setMeta('addToHistory', false))
              }
            },
            stagePastedText: (token) => {
              const pill = { type: NativeChatFileReference.name, attrs: { token } }
              editor.view.dispatch(closeHistory(editor.state.tr))
              editor.view.dispatch(
                editor.state.tr.replaceSelectionWith(editor.schema.nodeFromJSON(pill), false)
              )
              editor.view.dispatch(closeHistory(editor.state.tr))
            },
            insertFileReferences: (paths) => {
              editor.commands.insertContentAt(
                editor.state.selection.from,
                paths.flatMap((path) => [fileReferenceContent(path), { type: 'text', text: ' ' }])
              )
            }
          }
        : null,
    [coordinates, editor, markdown, scopeKey]
  )
  useImperativeHandle(inputRef, () => input!, [input])

  return (
    <NativeChatPastedTextScopeProvider value={scopeKey ?? ''}>
      <NativeChatImageRowProvider value={imageRow}>
        <EditorContent
          editor={editor}
          {...events}
          data-disabled={disabled || undefined}
          className="data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
        />
      </NativeChatImageRowProvider>
    </NativeChatPastedTextScopeProvider>
  )
}
