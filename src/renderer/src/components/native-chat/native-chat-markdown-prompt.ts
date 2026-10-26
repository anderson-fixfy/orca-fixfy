// The composer's Markdown mode: the Markdown editor's formatting, with the prompt still read and
// written as the Markdown text the agent receives, and its carets as offsets into that text.
import { Extension, type AnyExtension, type Editor, type JSONContent } from '@tiptap/core'
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownExtensions } from '../editor/rich-markdown-extensions'
import { serializeRichMarkdownDocument } from '../editor/rich-markdown-literal-serialization'
import type { RichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { getRichMarkdownSerializationDocument } from '../editor/rich-markdown-trailing-paragraph'
import type { NativeChatPromptCoordinates } from './native-chat-prompt-document'

// Stands in for the caret while a document is serialized: a private-use character no prompt holds.
const CARET = String.fromCharCode(0xe000)

/** What was typed reaches the agent: `&`, `<` and `>` are not sent as HTML entities. */
function decodeTypedEntities(markdown: string): string {
  return markdown
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;(?!#?\w+;)/g, '&')
}

const NativeChatMarkdownTypedText = Extension.create({
  name: 'nativeChatMarkdownTypedText',
  onBeforeCreate() {
    // Every text node, marked or not, is encoded here; the method is private only in the typings.
    const manager = this.editor.markdown
    const encode: unknown = manager && Reflect.get(manager, 'encodeTextForMarkdown')
    if (!manager || typeof encode !== 'function') {
      return
    }
    Reflect.set(manager, 'encodeTextForMarkdown', (text: string, ...rest: unknown[]) => {
      const encoded: unknown = encode.call(manager, text, ...rest)
      // Code text comes back as it was, and stays so.
      return typeof encoded === 'string' && encoded !== text
        ? decodeTypedEntities(encoded)
        : encoded
    })
  }
})

const NativeChatMarkdownShiftEnter = Extension.create({
  name: 'nativeChatMarkdownShiftEnter',
  // Ahead of the hard break's own Shift+Enter.
  priority: 1000,
  // Why: Enter sends, so Shift+Enter is the Markdown editor's Enter: a paragraph, item or code line.
  addKeyboardShortcuts() {
    return { 'Shift-Enter': () => this.editor.commands.keyboardShortcut('Enter') }
  }
})

export function createNativeChatMarkdownPromptExtensions(
  codec: RichMarkdownEditorCodec
): AnyExtension[] {
  return [
    ...createRichMarkdownExtensions({ codec }),
    NativeChatMarkdownTypedText,
    NativeChatMarkdownShiftEnter
  ]
}

export function markdownPromptContent(
  editor: Editor,
  codec: RichMarkdownEditorCodec,
  markdown: string
): JSONContent {
  const content = editor.markdown!.parse(encodeRawMarkdownHtmlForRichEditor(markdown, codec))
  return content.content?.length ? content : { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function markdownPromptText(editor: Editor, doc = editor.state.doc): string {
  return serializeRichMarkdownDocument(editor, getRichMarkdownSerializationDocument(editor, doc))
}

/** The Markdown caret for a document position. */
export function markdownPromptOffset(
  editor: Editor,
  doc: ProseMirrorNode,
  position: number
): number {
  if (position <= 0) {
    return 0
  }
  // The end, and the empty paragraph kept below a final list or code block, end the text.
  if (position >= getRichMarkdownSerializationDocument(editor, doc).content.size) {
    return markdownPromptText(editor, doc).length
  }
  const $position = doc.resolve(position)
  const caret = $position.parent.inlineContent ? $position : Selection.near($position).$from
  try {
    const marked = doc.replace(
      caret.pos,
      caret.pos,
      new Slice(Fragment.from(editor.schema.text(CARET, caret.marks())), 0, 0)
    )
    const index = markdownPromptText(editor, marked).indexOf(CARET)
    if (index !== -1) {
      return index
    }
  } catch {
    // A position no text fits in falls through to the end.
  }
  return markdownPromptText(editor, doc).length
}

/** The document position for a Markdown caret; one inside a pill's token or a run's delimiters
 *  lands on the nearest position `before` or `after` it. */
export function markdownPromptPosition(
  editor: Editor,
  doc: ProseMirrorNode,
  offset: number,
  side: 'before' | 'after' = 'before'
): number {
  const positions: number[] = []
  doc.descendants((node, start) => {
    if (!node.inlineContent) {
      return true
    }
    let position = start + 1
    positions.push(position)
    node.forEach((child) => {
      if (child.isText) {
        for (let index = 0; index < child.nodeSize; index++) {
          positions.push(++position)
        }
      } else {
        position += child.nodeSize
        positions.push(position)
      }
    })
    return false
  })
  // The first position at or past the offset; carets only grow along the document.
  let low = 0
  let high = positions.length
  let found: number | undefined
  while (low < high) {
    const middle = (low + high) >> 1
    const caret = markdownPromptOffset(editor, doc, positions[middle]!)
    if (caret < offset) {
      low = middle + 1
    } else {
      high = middle
      found = caret
    }
  }
  const at = positions[low]
  if (at === undefined) {
    return positions.at(-1) ?? 0
  }
  return side === 'after' || found === offset || low === 0 ? at : positions[low - 1]!
}

export function markdownPromptCoordinates(
  editor: Editor,
  codec: RichMarkdownEditorCodec
): NativeChatPromptCoordinates {
  return {
    text: (doc) => markdownPromptText(editor, doc),
    offset: (doc, position) => markdownPromptOffset(editor, doc, position),
    position: (doc, offset, side) => markdownPromptPosition(editor, doc, offset, side),
    content: (text) => markdownPromptContent(editor, codec, text)
  }
}
