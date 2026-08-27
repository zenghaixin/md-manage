/**
 * 词条新建 / 编辑：挂在可拖拽浮层；未确认关闭则丢弃。
 */
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { api } from '../../../../../api'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  requestReloadFilePath,
  requestSaveCurrentFile,
  getActiveDocPath,
} from '../../../../shellEvents'
import { alertError } from '../../../../../composables/useDialog'
import {
  closeFloatHost,
  openFloatHost,
  nextFloatZIndex,
  type FloatHostMount,
  type CascadeAnchor,
} from '../../../../../components/draggable-float'
import { ensureTermGlossaryStyles } from '../shared/styles'
import { replaceTermBlock, sanitizeTermTitle, peelRemarkBraceFromDescription, formatTermSource } from '../model/syntax'
import {
  getTermRemarkIdFromNode,
  findTermPosInDoc,
  serializeTermDescriptionFromNode,
} from '../model/serializeDesc'
import { suppressAutoConfirmForTitle } from '../match/match'
import { replaceRangeWithTermRef } from '../match/convert'
import { commitTermRename } from '../rename/renameFlow'
import { TERM_NODE_NAME } from '../shared/constants'
import { GLOSSARY_DEFAULT_FILE, isGlossaryDefPath, normalizeDocPath } from '../shared/glossaryPaths'
import { normalizeRefSources, normalizeTermRefs } from '../shared/termRefSlots'
import {
  insertTermDefinition,
  repairTermRemarkLeak,
  replaceTermDefinition,
} from '../model/termOps'
import { getActiveTermEditor } from '../shared/editorViewRef'
import TermEditorFloatHost from './TermEditorFloatHost.vue'

const EDITOR_W = 520
const EDITOR_H = 620
const CASCADE_ID = 'term-editor-float'

type CreateSession = {
  mode: 'create'
  /** 可选：有编辑器时用于定位；落盘不依赖当前文档 */
  editor?: Editor | null
  insertPos?: number
  /** 新建默认存储位置（词条下当前文件优先） */
  preferredTargetPath?: string
  /** 新建时预填标题（如选区「设置词条」） */
  initialTitle?: string
  /** 确认后把该选区包成 termRef */
  selectionFrom?: number
  selectionTo?: number
  /** 从词条编辑浮层描述区发起：确认后在 lite 编辑器写 term[] */
  descWrapView?: EditorView | null
}

type EditSession = {
  mode: 'edit'
  editor: Editor
  nodePos: number
  title: string
  description: string
  remarkId: string
}

/** 从引用弹窗等按词库标题编辑（未必在当前文档） */
type CatalogEditSession = {
  mode: 'catalog-edit'
  title: string
  description: string
  sourcePath: string
  remarkId: string
}

type Session = CreateSession | EditSession | CatalogEditSession

type ConfirmPayload = {
  title: string
  description: string
  /** 新建时落盘存储位置；空则默认词条 */
  targetPath?: string
  /** 引用槽位值（如人物.md 的武器） */
  refs?: Record<string, string[]>
  /** 各槽位选用的数据源 md */
  refSources?: string[]
}

let session: Session | null = null
let floatMount: FloatHostMount | null = null
/** 编辑浮层已打开时，从描述区叠开的新建浮层 */
let nestedCreateSession: CreateSession | null = null
let nestedCreateMount: FloatHostMount | null = null
/** 从哪个弹窗打开：贴其右侧 */
let openBeside: CascadeAnchor | null = null
/** 来源父容器（首扇相对容器测距） */
let openContainer: CascadeAnchor | null = null

function sessionKey(s: Session): string {
  if (s.mode === 'create') return `create:${s.insertPos ?? 'glossary'}`
  if (s.mode === 'edit') return `edit:${s.title}`
  return `catalog:${s.title}`
}

function teardownMount() {
  closeFloatHost(floatMount)
  floatMount = null
}

function closeNestedCreate() {
  closeFloatHost(nestedCreateMount)
  nestedCreateMount = null
  nestedCreateSession = null
}

function buildFloatHostProps(
  s: Session,
  mountRef: { current: FloatHostMount | null },
  onCancel: () => void,
) {
  const isCreate = s.mode === 'create'
  const remarkId = s.mode === 'create' ? '' : String(s.remarkId || '').trim()
  const store = useGlossaryStore()
  const editTitle =
    s.mode === 'create' ? '' : sanitizeTermTitle(s.title) || s.title
  const initialSourcePath =
    s.mode === 'create'
      ? ''
      : s.mode === 'catalog-edit'
        ? String(s.sourcePath || '')
        : normalizeDocPath(getActiveDocPath()) ||
          String(store.getTerm(editTitle)?.sourcePath || '')
  const initialRefSources = editTitle
    ? normalizeRefSources(store.getTerm(editTitle)?.refSources, store.index.entries)
    : []
  const initialRefs = editTitle
    ? normalizeTermRefs(store.getTerm(editTitle)?.refs, initialRefSources)
    : {}

  return ({ place, zIndex }: { place: { left: number; top: number }; zIndex: number }) => ({
    mode: isCreate ? 'create' : 'edit',
    initialTitle: isCreate
      ? String((s as CreateSession).initialTitle || '')
      : s.title,
    initialDescription: isCreate ? '' : s.description,
    initialTargetPath:
      isCreate && s.mode === 'create'
        ? String(s.preferredTargetPath || GLOSSARY_DEFAULT_FILE)
        : '',
    initialSourcePath,
    initialRefs,
    initialRefSources,
    remarkId,
    floatLeft: place.left,
    floatTop: place.top,
    zIndex,
    onConfirm: (payload: ConfirmPayload) => {
      void handleConfirm(payload)
    },
    onCancel,
    onFocus: () => {
      mountRef.current?.host.setZIndex?.(nextFloatZIndex())
    },
  })
}

function mountCreateFloat(
  s: CreateSession,
  besideRect?: CascadeAnchor | null,
  containerRect?: CascadeAnchor | null,
  nested = false,
) {
  ensureTermGlossaryStyles()
  const mountRef = { current: null as FloatHostMount | null }
  const mount = openFloatHost({
    cascadeId: nested ? `${CASCADE_ID}-nested` : CASCADE_ID,
    width: EDITOR_W,
    height: EDITOR_H,
    besideRect,
    containerRect,
    rootClassName: 'ext-term-editor-float-root',
    component: TermEditorFloatHost,
    props: buildFloatHostProps(s, mountRef, () => {
      if (nested) closeNestedCreate()
      else closeDiscard()
    }),
  })
  mountRef.current = mount
  if (nested) {
    nestedCreateMount = mount
    nestedCreateSession = s
  } else {
    floatMount = mount
  }
}

function discardSession() {
  session = null
  openBeside = null
  openContainer = null
}

function present() {
  const s = session
  if (!s) return
  ensureTermGlossaryStyles()
  teardownMount()

  const besideRect = openBeside
  const containerRect = openContainer
  openBeside = null
  openContainer = null

  const mountRef = { current: null as FloatHostMount | null }
  floatMount = openFloatHost({
    cascadeId: CASCADE_ID,
    width: EDITOR_W,
    height: EDITOR_H,
    besideRect,
    containerRect,
    rootClassName: 'ext-term-editor-float-root',
    component: TermEditorFloatHost,
    props: buildFloatHostProps(s, mountRef, () => closeDiscard()),
  })
  mountRef.current = floatMount
}

function closeDiscard() {
  if (nestedCreateMount) {
    closeNestedCreate()
    return
  }
  discardSession()
  teardownMount()
}

function closeAfterConfirm() {
  session = null
  teardownMount()
}

async function persistCatalogFields(opts: {
  title: string
  description: string
  sourcePath: string
  refs?: Record<string, string[]>
  refSources?: string[]
}) {
  const store = useGlossaryStore()
  const prev = store.getTerm(opts.title)
  const refSources =
    opts.refSources !== undefined
      ? normalizeRefSources(opts.refSources, store.index.entries)
      : normalizeRefSources(prev?.refSources, store.index.entries)
  const refs =
    opts.refs !== undefined
      ? normalizeTermRefs(opts.refs, refSources)
      : normalizeTermRefs(prev?.refs, refSources)
  const terms = {
    ...store.terms,
    [opts.title]: prev
      ? {
          ...prev,
          description: opts.description,
          sourcePath: opts.sourcePath || prev.sourcePath || '',
          refs,
          refSources,
        }
      : {
          title: opts.title,
          description: opts.description,
          sourcePath: opts.sourcePath || '',
          refs,
          refSources,
          ignoreContexts: [],
          formerTitles: [],
          pendingManualConfirm: [],
        },
  }
  await store.persistTerms(terms)
}

async function handleCatalogConfirm(
  s: CatalogEditSession,
  payload: {
    title: string
    description: string
    refs?: Record<string, string[]>
    refSources?: string[]
  },
) {
  const store = useGlossaryStore()
  const oldTitle = sanitizeTermTitle(s.title)
  const { title, description } = payload
  const sourcePath = String(s.sourcePath || '').trim()
  const remarkId = String(s.remarkId || '').trim()
  const renamed = oldTitle !== title

  if (renamed && store.getTerm(title) && title !== oldTitle) {
    await alertError(`词条「${title}」已存在`)
    return
  }

  if (renamed) suppressAutoConfirmForTitle(title)

  try {
    if (sourcePath) {
      const { content } = await api.getFileByPath(sourcePath)
      const nextMd = replaceTermBlock(
        content,
        oldTitle || s.title,
        title,
        description,
        remarkId,
      )
      await api.saveFileByPath(sourcePath, nextMd)

      if (renamed) {
        await commitTermRename({
          oldTitle,
          newTitle: title,
          description,
          sourcePath,
          saveCurrent: false,
        })
      } else {
        await store.syncFileByPath(sourcePath, nextMd)
        requestReloadFilePath(sourcePath)
      }
      await persistCatalogFields({
        title,
        description,
        sourcePath,
        refs: payload.refs,
        refSources: payload.refSources,
      })
    } else if (renamed) {
      await commitTermRename({
        oldTitle,
        newTitle: title,
        description,
        sourcePath: '',
        saveCurrent: false,
      })
      await persistCatalogFields({
        title,
        description,
        sourcePath: '',
        refs: payload.refs,
        refSources: payload.refSources,
      })
    } else {
      await persistCatalogFields({
        title,
        description,
        sourcePath: '',
        refs: payload.refs,
        refSources: payload.refSources,
      })
    }
  } catch (err) {
    console.warn('[term-editor] catalog save failed:', err)
    await alertError(err instanceof Error ? err.message : '保存失败')
    return
  }
  closeAfterConfirm()
}

async function handleConfirm(payload: ConfirmPayload) {
  const nested = nestedCreateSession
  const s = nested ?? session
  if (!s) return

  const title = sanitizeTermTitle(payload.title)
  const peeled = peelRemarkBraceFromDescription(
    String(payload.description ?? '').replace(/\u00a0/g, ' '),
  )
  const description = peeled.description.trim()
  if (!title) {
    await alertError('请填写词条标题')
    return
  }
  if (!description) {
    await alertError('请填写词条描述')
    return
  }

  if (s.mode === 'catalog-edit') {
    if (nested) return
    await handleCatalogConfirm(s, {
      title,
      description,
      refs: payload.refs,
      refSources: payload.refSources,
    })
    return
  }

  const store = useGlossaryStore()

  if (s.mode === 'create') {
    if (store.getTerm(title)) {
      await alertError(`词条「${title}」已存在`)
      return
    }
    try {
      let sourcePath = normalizeDocPath(payload.targetPath || '')
      if (!sourcePath || !isGlossaryDefPath(sourcePath) || !sourcePath.endsWith('.md')) {
        sourcePath = GLOSSARY_DEFAULT_FILE
      }
      const editingTarget =
        !!s.editor &&
        !s.editor.isDestroyed &&
        normalizeDocPath(getActiveDocPath()) === sourcePath

      if (editingTarget) {
        // 当前正在改这个入口文件：只改编辑器再存盘，避免 getFile+reload 把正文盖掉
        wrapCreateSelectionAsTermRef(s, title)
        insertTermDefinition(s.editor!, {
          title,
          description,
          at: s.editor!.state.doc.content.size,
        })
        await requestSaveCurrentFile()
        await persistCatalogFields({
          title,
          description,
          sourcePath,
          refs: payload.refs,
          refSources: payload.refSources,
        })
      } else {
        await ensureGlossaryEntryFile(sourcePath)
        let content = ''
        try {
          const file = await api.getFileByPath(sourcePath)
          content = String(file?.content ?? '')
        } catch {
          content = ''
        }
        const block = formatTermSource(title, description)
        const nextMd = content.trimEnd()
          ? `${content.replace(/\s*$/, '')}\n\n${block}\n`
          : `${block}\n`
        await api.saveFileByPath(sourcePath, nextMd)
        await store.syncFileByPath(sourcePath, nextMd)
        await persistCatalogFields({
          title,
          description,
          sourcePath,
          refs: payload.refs,
          refSources: payload.refSources,
        })
        wrapCreateSelectionAsTermRef(s, title)
      }
    } catch (err) {
      console.warn('[term-editor] create to glossary file failed:', err)
      await alertError(err instanceof Error ? err.message : '新建词条失败')
      return
    }
    if (nested) closeNestedCreate()
    else closeAfterConfirm()
    return
  }

  if (nested) return

  // edit（当前文档定义块）
  const editor = s.editor
  if (!editor || editor.isDestroyed) {
    closeDiscard()
    return
  }
  const oldTitle = sanitizeTermTitle(s.title)
  const node = editor.state.doc.nodeAt(s.nodePos)
  if (!node || node.type.name !== TERM_NODE_NAME) {
    await alertError('词条位置已失效，请关闭后重试')
    closeDiscard()
    return
  }

  if (oldTitle && oldTitle !== title) {
    if (store.getTerm(title) && title !== oldTitle) {
      await alertError(`词条「${title}」已存在`)
      return
    }
    const replaced = replaceTermDefinition(editor, {
      pos: s.nodePos,
      title,
      description,
    })
    if (!replaced) {
      await alertError('更新词条失败')
      return
    }
    try {
      await commitTermRename({
        oldTitle,
        newTitle: title,
        description,
        saveCurrent: true,
        editor,
      })
      const prev = store.getTerm(title)
      const refSources =
        payload.refSources !== undefined
          ? normalizeRefSources(payload.refSources, store.index.entries)
          : normalizeRefSources(prev?.refSources, store.index.entries)
      const refs =
        payload.refs !== undefined
          ? normalizeTermRefs(payload.refs, refSources)
          : normalizeTermRefs(prev?.refs, refSources)
      const terms = {
        ...store.terms,
        [title]: prev
          ? { ...prev, description, refs, refSources }
          : {
              title,
              description,
              sourcePath: '',
              refs,
              refSources,
              ignoreContexts: [],
              formerTitles: [],
              pendingManualConfirm: [],
            },
      }
      await store.persistTerms(terms)
    } catch (err) {
      console.warn('[term-editor] rename/persist failed:', err)
    }
    closeAfterConfirm()
    return
  }

  const replaced = replaceTermDefinition(editor, {
    pos: s.nodePos,
    title,
    description,
  })
  if (!replaced) {
    await alertError('更新词条失败')
    return
  }
  try {
    const prev = store.getTerm(title)
    const refSources =
      payload.refSources !== undefined
        ? normalizeRefSources(payload.refSources, store.index.entries)
        : normalizeRefSources(prev?.refSources, store.index.entries)
    const refs =
      payload.refs !== undefined
        ? normalizeTermRefs(payload.refs, refSources)
        : normalizeTermRefs(prev?.refs, refSources)
    const terms = {
      ...store.terms,
      [title]: prev
        ? { ...prev, description, refs, refSources }
        : {
            title,
            description,
            sourcePath: '',
            refs,
            refSources,
            ignoreContexts: [],
            formerTitles: [],
            pendingManualConfirm: [],
          },
    }
    await requestSaveCurrentFile()
    await store.persistTerms(terms)
  } catch (err) {
    console.warn('[term-editor] persist edit failed:', err)
  }
  closeAfterConfirm()
}

function wrapCreateSelectionAsTermRef(s: CreateSession, title: string) {
  if (
    typeof s.selectionFrom !== 'number' ||
    typeof s.selectionTo !== 'number' ||
    s.selectionTo <= s.selectionFrom
  ) {
    return
  }

  const view = s.descWrapView
  if (view?.dom?.isConnected) {
    try {
      const size = view.state.doc.content.size
      const from = Math.max(0, Math.min(s.selectionFrom, size))
      const to = Math.max(from, Math.min(s.selectionTo, size))
      const tr = view.state.tr
      if (replaceRangeWithTermRef(tr, view.state.schema, from, to, title)) {
        view.dispatch(tr)
      }
    } catch (err) {
      console.warn('[term-editor] wrap desc selection as termRef failed:', err)
    }
    return
  }

  if (!s.editor || s.editor.isDestroyed) return
  try {
    const size = s.editor.state.doc.content.size
    const from = Math.max(0, Math.min(s.selectionFrom, size))
    const to = Math.max(from, Math.min(s.selectionTo, size))
    const tr = s.editor.state.tr
    if (replaceRangeWithTermRef(tr, s.editor.schema, from, to, title)) {
      s.editor.view.dispatch(tr)
    }
  } catch (err) {
    console.warn('[term-editor] wrap selection as termRef failed:', err)
  }
}

async function ensureGlossaryEntryFile(sourcePath: string) {
  const path = normalizeDocPath(sourcePath)
  try {
    await api.getFileByPath(path)
    return
  } catch {
    // 默认入口被删：重建；其它入口缺失则报错
  }
  if (path === GLOSSARY_DEFAULT_FILE) {
    await api.createFileIn('词条', '默认词条')
    return
  }
  throw new Error(`入口文件不存在：${path}`)
}

function openSession(
  next: Session,
  besideRect?: CascadeAnchor | null,
  containerRect?: CascadeAnchor | null,
) {
  // 同一编辑会话已打开：置顶 + 闪烁，不重挂（避免丢未保存草稿）
  if (session && floatMount && sessionKey(session) === sessionKey(next)) {
    floatMount.host.bringFront?.()
    return
  }
  session = next
  openBeside = besideRect ?? null
  openContainer = containerRect ?? null
  present()
}

/** 从编辑器光标取锚点矩形（用于浮层贴光标打开） */
function cursorAnchorFromEditor(editor: Editor | null | undefined): CascadeAnchor | null {
  if (!editor || editor.isDestroyed) return null
  try {
    const c = editor.view.coordsAtPos(editor.state.selection.from)
    if (![c.left, c.right, c.top, c.bottom].every((n) => Number.isFinite(n))) {
      return null
    }
    return { left: c.left, right: c.right, top: c.top, bottom: c.bottom }
  } catch {
    return null
  }
}

/** 新建词条：浮层贴光标打开；确认后写入所选存储位置（词条下当前文件优先，否则默认词条） */
export function openTermEditorCreate(opts: {
  editor?: Editor | null
  insertPos?: number
  besideRect?: CascadeAnchor | null
  /** 显式指定存储位置；否则若当前打开文件在词条下则用当前文件 */
  targetPath?: string
  /** 预填标题 */
  initialTitle?: string
  /** 确认后把该选区包成 termRef */
  selectionFrom?: number
  selectionTo?: number
} = {}) {
  if (opts.editor?.isDestroyed) return
  const editor = opts.editor ?? getActiveTermEditor()
  const beside =
    opts.besideRect ?? cursorAnchorFromEditor(editor)
  openSession(
    {
      mode: 'create',
      editor: editor ?? null,
      insertPos: opts.insertPos,
      preferredTargetPath: resolveCreateTargetPath(opts.targetPath),
      initialTitle: sanitizeTermTitle(opts.initialTitle || '') || undefined,
      selectionFrom: opts.selectionFrom,
      selectionTo: opts.selectionTo,
    },
    beside,
  )
}

/** 词条编辑浮层描述区选区「设为词条」：叠开新建浮层，标题预填选中文案 */
export function openTermEditorCreateFromDesc(opts: {
  initialTitle: string
  descView: EditorView
  selectionFrom: number
  selectionTo: number
  besideRect: CascadeAnchor
}) {
  const createSession: CreateSession = {
    mode: 'create',
    editor: getActiveTermEditor(),
    preferredTargetPath: resolveCreateTargetPath(),
    initialTitle: sanitizeTermTitle(opts.initialTitle) || undefined,
    selectionFrom: opts.selectionFrom,
    selectionTo: opts.selectionTo,
    descWrapView: opts.descView,
  }
  if (session?.mode === 'edit' && floatMount) {
    mountCreateFloat(createSession, opts.besideRect, null, true)
    return
  }
  openSession(createSession, opts.besideRect)
}

function resolveCreateTargetPath(explicit?: string): string {
  const candidates = [explicit, getActiveDocPath()]
  for (const raw of candidates) {
    const path = normalizeDocPath(raw || '')
    if (path && isGlossaryDefPath(path) && path.endsWith('.md')) {
      return path
    }
  }
  return GLOSSARY_DEFAULT_FILE
}

function rectFromDom(el: Element | null | undefined): CascadeAnchor | null {
  if (!el || !document.body.contains(el)) return null
  const r = el.getBoundingClientRect()
  if (![r.left, r.right, r.top, r.bottom].every((n) => Number.isFinite(n))) {
    return null
  }
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
}

/** 从定义块打开编辑：锚点为编辑按钮，容器为整块定义 */
export function openTermEditorEdit(opts: {
  editor: Editor
  nodePos: number
  besideRect?: CascadeAnchor | null
  containerRect?: CascadeAnchor | null
}) {
  const { editor } = opts
  if (editor.isDestroyed) return
  const nodePos = repairTermRemarkLeak(editor, opts.nodePos)
  const node = editor.state.doc.nodeAt(nodePos)
  if (!node || node.type.name !== 'termGlossary') return
  const title = sanitizeTermTitle(node.attrs.title) || String(node.attrs.title ?? '')
  const description = serializeTermDescriptionFromNode(node)
  const remarkId = getTermRemarkIdFromNode(node)
  const blockEl = editor.view.nodeDOM(nodePos) as Element | null
  const beside =
    opts.besideRect ?? rectFromDom(blockEl)
  const container =
    opts.containerRect ?? rectFromDom(blockEl)
  openSession(
    {
      mode: 'edit',
      editor,
      nodePos,
      title,
      description,
      remarkId,
    },
    beside,
    container,
  )
}

/** 从引用弹窗等：按词库标题打开同一套编辑浮层 */
export function openTermEditorEditByTitle(opts: {
  title: string
  /** 当前弹窗矩形：编辑贴其右侧 */
  besideRect?: CascadeAnchor | null
  /** @deprecated 使用 besideRect */
  place?: { left: number; top: number }
}) {
  const key = sanitizeTermTitle(opts.title)
  if (!key) return
  const stored = useGlossaryStore().getTerm(key)
  if (!stored) {
    void alertError(`词条「${opts.title}」不存在或尚未入库`)
    return
  }
  const peeled = peelRemarkBraceFromDescription(
    String(stored.description ?? ''),
  )
  let remarkId = peeled.remarkId
  const editor = getActiveTermEditor()
  if (editor && !editor.isDestroyed) {
    const hit = findTermPosInDoc(editor.state.doc, key)
    if (hit) {
      const pos = repairTermRemarkLeak(editor, hit.pos)
      const node = editor.state.doc.nodeAt(pos)
      if (node) {
        remarkId = getTermRemarkIdFromNode(node) || remarkId
      }
    }
  }
  openSession(
    {
      mode: 'catalog-edit',
      title: key,
      description: peeled.description,
      sourcePath: String(stored.sourcePath ?? ''),
      remarkId,
    },
    opts.besideRect ?? null,
  )
}

/** 兼容旧入口；浮层无需注册右栏模块 */
export function bindTermEditorPanel() {
  // no-op：打开时直接挂到 body
}
