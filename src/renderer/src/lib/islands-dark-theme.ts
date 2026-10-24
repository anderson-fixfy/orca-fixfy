import type { editor } from 'monaco-editor'
import type { ThemeRegistration } from 'shiki/core'

/**
 * Android Studio's "Islands Dark" color scheme (themes/islands/IslandSchemeDark.xml in
 * intellij.platform.ide.impl.jar, parent Darcula), shared by Monaco and the Shiki highlighter.
 */
const PALETTE = {
  background: '#191A1C', // TEXT
  text: '#BCBEC4', // TEXT, DEFAULT_IDENTIFIER, DEFAULT_CLASS_REFERENCE
  keyword: '#CF8E6D', // DEFAULT_KEYWORD, DEFAULT_VALID_STRING_ESCAPE
  string: '#6AAB73', // DEFAULT_STRING
  number: '#2AACB8', // DEFAULT_NUMBER
  comment: '#7A7E85', // DEFAULT_LINE_COMMENT
  docComment: '#5F826B', // DEFAULT_DOC_COMMENT
  docCommentTag: '#67A37C', // DEFAULT_DOC_COMMENT_TAG
  functionDeclaration: '#56A8F5', // DEFAULT_FUNCTION_DECLARATION, MARKDOWN_LINK_TEXT
  field: '#C77DBB', // DEFAULT_INSTANCE_FIELD, DEFAULT_CONSTANT
  typeParameter: '#16BAAC', // TYPE_PARAMETER_NAME_ATTRIBUTES
  metadata: '#B3AE60', // DEFAULT_METADATA
  tag: '#D5B778', // XML_TAG_NAME, HTML_TAG_NAME
  attributeName: '#BABABA', // HTML_ATTRIBUTE_NAME
  invalid: '#F75464', // BAD_CHARACTER
  added: '#73BD79', // FILESTATUS_ADDED
  modified: '#70AEFF' // FILESTATUS_MODIFIED
} as const

export const ISLANDS_DARK_THEME_NAME = 'islands-dark'

export function monacoThemeName(isDark: boolean): string {
  return isDark ? ISLANDS_DARK_THEME_NAME : 'vs'
}

type MonacoRule = [token: string, foreground?: string, fontStyle?: string]

const MONACO_RULES: MonacoRule[] = [
  ['invalid', PALETTE.invalid],
  ['emphasis', undefined, 'italic'],
  ['strong', undefined, 'bold'],
  ['variable', PALETTE.text],
  // Why: `this` and `super` are keywords in the IDE.
  ['variable.predefined', PALETTE.keyword],
  ['constant', PALETTE.field, 'italic'],
  ['comment', PALETTE.comment],
  ['comment.doc', PALETTE.docComment, 'italic'],
  ['number', PALETTE.number],
  ['regexp', PALETTE.string],
  ['annotation', PALETTE.metadata],
  ['type', PALETTE.text],
  ['delimiter', PALETTE.text],
  ['tag', PALETTE.tag],
  ['metatag', PALETTE.tag],
  ['metatag.content', PALETTE.string],
  // Why: the IDE colors YAML keys as keywords.
  ['key', PALETTE.keyword],
  ['string.key.json', PALETTE.field],
  ['string.value.json', PALETTE.string],
  ['attribute.name', PALETTE.attributeName],
  ['attribute.name.css', PALETTE.field],
  ['attribute.value', PALETTE.string],
  ['attribute.value.number', PALETTE.number],
  ['attribute.value.unit', PALETTE.number],
  ['string', PALETTE.string],
  ['string.escape', PALETTE.keyword],
  ['keyword', PALETTE.keyword],
  ['operator', PALETTE.text],
  ['predefined', PALETTE.text]
]

export const ISLANDS_DARK_MONACO_THEME: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: false,
  rules: [
    { token: '', foreground: PALETTE.text, background: PALETTE.background },
    ...MONACO_RULES.map(([token, foreground, fontStyle]) => ({ token, foreground, fontStyle }))
  ],
  colors: {
    'editor.background': PALETTE.background,
    'editor.foreground': PALETTE.text,
    'editor.selectionBackground': '#214283', // SELECTION_BACKGROUND
    'editor.inactiveSelectionBackground': '#2B2D30',
    'editor.selectionHighlightBackground': '#373B39', // IDENTIFIER_UNDER_CARET_ATTRIBUTES
    'editor.findMatchHighlightBackground': '#2D543F', // SEARCH_RESULT_ATTRIBUTES
    'editor.lineHighlightBackground': '#1F2024', // CARET_ROW_COLOR
    'editorCursor.foreground': '#CED0D6', // CARET_COLOR
    'editorLineNumber.foreground': '#4B5059', // LINE_NUMBERS_COLOR
    'editorLineNumber.activeForeground': '#A1A3AB', // LINE_NUMBER_ON_CARET_ROW_COLOR
    'editorIndentGuide.background1': '#323438', // INDENT_GUIDE
    'editorIndentGuide.activeBackground1': '#4E5157', // SELECTED_INDENT_GUIDE
    'editorWhitespace.foreground': '#6F737A', // WHITESPACES
    'editorRuler.foreground': '#323438', // RIGHT_MARGIN_COLOR
    'editorGutter.background': PALETTE.background
  }
}

type ShikiRule = [scope: string[], foreground?: string, fontStyle?: string]

const SHIKI_RULES: ShikiRule[] = [
  [['comment', 'punctuation.definition.comment'], PALETTE.comment],
  [['comment.block.documentation', 'comment.block.javadoc'], PALETTE.docComment, 'italic'],
  [
    ['comment.block.documentation storage.type', 'comment.block.documentation keyword'],
    PALETTE.docCommentTag
  ],
  [
    [
      'keyword',
      'storage',
      'constant.language',
      'variable.language',
      'keyword.operator.new',
      'keyword.operator.expression',
      'keyword.operator.word',
      'punctuation.definition.template-expression',
      'constant.character.escape',
      'support.type.primitive'
    ],
    PALETTE.keyword
  ],
  [['keyword.operator'], PALETTE.text],
  [['string', 'string.regexp'], PALETTE.string],
  [['meta.template.expression'], PALETTE.text],
  [['constant.numeric'], PALETTE.number],
  [['entity.name.function', 'support.function'], PALETTE.functionDeclaration],
  [['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], PALETTE.text],
  [['entity.name.type.parameter', 'meta.type.parameters entity.name.type'], PALETTE.typeParameter],
  [
    [
      'variable.other.property',
      'variable.other.object.property',
      'meta.object-literal.key',
      'support.variable.property',
      'support.type.property-name'
    ],
    PALETTE.field
  ],
  [
    ['variable.other.constant', 'constant.other', 'variable.other.enummember'],
    PALETTE.field,
    'italic'
  ],
  [
    [
      'meta.decorator entity.name.function',
      'meta.decorator variable.other.readwrite',
      'punctuation.decorator',
      'storage.type.annotation',
      'entity.name.type.annotation',
      'entity.name.type.annotation-site',
      'entity.name.function.decorator'
    ],
    PALETTE.metadata
  ],
  [['entity.name.tag'], PALETTE.tag],
  [['entity.name.tag.yaml'], PALETTE.keyword],
  [['entity.other.attribute-name'], PALETTE.attributeName],
  [['invalid'], PALETTE.invalid],
  [['markup.heading'], PALETTE.keyword],
  [['markup.italic'], undefined, 'italic'],
  [['markup.bold'], undefined, 'bold'],
  [['markup.underline.link', 'string.other.link'], PALETTE.functionDeclaration],
  [['markup.inserted'], PALETTE.added],
  [['markup.deleted'], PALETTE.invalid],
  [['markup.changed'], PALETTE.modified]
]

export const ISLANDS_DARK_SHIKI_THEME: ThemeRegistration = {
  name: ISLANDS_DARK_THEME_NAME,
  type: 'dark',
  fg: PALETTE.text,
  bg: PALETTE.background,
  settings: [
    { settings: { foreground: PALETTE.text, background: PALETTE.background } },
    ...SHIKI_RULES.map(([scope, foreground, fontStyle]) => ({
      scope,
      settings: { foreground, fontStyle }
    }))
  ]
}
