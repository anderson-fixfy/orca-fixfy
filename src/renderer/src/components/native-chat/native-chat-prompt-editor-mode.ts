// The composer's two modes: plain text, or Markdown shown formatted (the chat settings switch).
import { getSchema, type AnyExtension, type Editor, type JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import type { RichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { readNativeChatDraftDocument } from './native-chat-draft-cache'
import {
  createNativeChatMarkdownPromptExtensions,
  markdownPromptCoordinates
} from './native-chat-markdown-prompt'
import {
  PLAIN_PROMPT_COORDINATES,
  promptTextContent,
  type NativeChatPromptCoordinates
} from './native-chat-prompt-document'

const PLAIN_TEXT_EXTENSIONS = StarterKit.configure({
  blockquote: false,
  bold: false,
  bulletList: false,
  code: false,
  codeBlock: false,
  dropcursor: false,
  gapcursor: false,
  heading: false,
  horizontalRule: false,
  italic: false,
  link: false,
  listItem: false,
  orderedList: false,
  strike: false,
  underline: false,
  trailingNode: false
})

export function promptModeExtensions(
  markdown: boolean,
  codec: RichMarkdownEditorCodec
): AnyExtension[] {
  return markdown ? createNativeChatMarkdownPromptExtensions(codec) : [PLAIN_TEXT_EXTENSIONS]
}

/** The text the composer reads, sends and keeps its carets in: Markdown with the switch on. */
export function promptModeCoordinates(
  editor: Editor | null,
  markdown: boolean,
  codec: RichMarkdownEditorCodec
): NativeChatPromptCoordinates {
  return markdown && editor ? markdownPromptCoordinates(editor, codec) : PLAIN_PROMPT_COORDINATES
}

function fitsSchema(schema: Schema, content: JSONContent): boolean {
  try {
    schema.nodeFromJSON(content).check()
    return true
  } catch {
    return false
  }
}

/** A new editor's first content: the draft's stored document when it fits, since skill chips live
 *  only there. One the other mode saved can fit and read as other text, so `stored` asks for a
 *  check once the editor can read it. */
export function initialPromptContent(
  extensions: AnyExtension[],
  markdown: boolean,
  codec: RichMarkdownEditorCodec,
  scopeKey: string | undefined,
  value: string
): { content: JSONContent | string; contentType?: 'markdown'; stored: boolean } {
  const stored = scopeKey ? readNativeChatDraftDocument(scopeKey, value) : undefined
  if (stored && fitsSchema(getSchema(extensions), stored)) {
    return { content: stored, stored: true }
  }
  return markdown
    ? {
        content: encodeRawMarkdownHtmlForRichEditor(value, codec),
        contentType: 'markdown',
        stored: false
      }
    : { content: promptTextContent(value), stored: false }
}

/** The draft's stored document when it reads as `value`. */
export function storedPromptDocument(
  editor: Editor,
  coordinates: NativeChatPromptCoordinates,
  scopeKey: string | undefined,
  value: string
): JSONContent | undefined {
  const stored = scopeKey ? readNativeChatDraftDocument(scopeKey, value) : undefined
  return stored &&
    fitsSchema(editor.schema, stored) &&
    coordinates.text(editor.schema.nodeFromJSON(stored)) === value
    ? stored
    : undefined
}

/** The whole document replaced as no edit of the user's: no undo step, no change event. */
export function replacePromptDocument(editor: Editor, content: JSONContent): void {
  const { tr, doc } = editor.state
  tr.replaceWith(0, doc.content.size, editor.schema.nodeFromJSON(content).content)
  editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true))
}
