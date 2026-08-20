/**
 * 词条新建 / 编辑：挂在可拖拽浮层；未确认关闭则丢弃。
 */
import { createApp, type App } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import type { Editor } from '@tiptap/core'
import { getActivePinia } from 'pinia'
import { api } from '../../../../../api'
import { useGlossaryStore } from '../../../../../stores/glossary'
import {
  requestReloadFilePath,
  requestSaveCurrentFile,
} from '../../../../shellEvents'
import { alertError } from '../../../../../composables/useDialog'
import {
  allocateCascadePlace,
  registerCascadeFloat,
  unregisterCascadeFloat,
  type CascadeAnchor,
} from '../../../../../components/floatCascade'
import { nextFloatZIndex } from '../../../../../components/floatZIndex'
import { ensureTermGlossaryStyles } from '../shared/styles'
import { replaceTermBlock, sanitizeTermTitle, peelRemarkBraceFromDescription } from '../model/syntax'
import {
  getTermRemarkIdFromNode,
  findTermPosInDoc,
  serializeTermDescriptionFromNode,
} from '../model/serializeDesc'
import { suppressAutoConfirmForTitle } from '../match/match'
import {
  normalizeTermType,
  TERM_TYPE_BASIC,
  type TermTypeId,
} from '../shared/termTypes'
import {
  normalizeTermAttrs,
  type TermAttrs,
} from '../../types/termAttrs'
import { commitTermRename } from '../rename/renameFlow'
import { TERM_NODE_NAME } from '../shared/constants'
import {
  insertTermDefinition,
  repairTermRemarkLeak,
  replaceTermDefinition,
} from '../model/termOps'
import { getActiveTermEditor } from '../shared/editorViewRef'
import TermEditorFloatHost from './TermEditorFloatHost.vue'

const EDITOR_W = 380
const EDITOR_H = 560
const CASCADE_ID = 'term-editor-float'

type CreateSession = {
  mode: 'create'
  editor: Editor
  termType: TermTypeId
  insertPos: number
  attrs: TermAttrs
}

type EditSession = {
  mode: 'edit'
  editor: Editor
  termType: TermTypeId
  nodePos: number
  title: string
  description: string
  attrs: TermAttrs
  remarkId: string
}

/** 从引用弹窗等按词库标题编辑（未必在当前文档） */
type CatalogEditSession = {
  mode: 'catalog-edit'
  title: string
  description: string
  termType: TermTypeId
  attrs: TermAttrs
  sourcePath: string
  remarkId: string
}

type Session = CreateSession | EditSession | CatalogEditSession

type ConfirmPayload = {
  title: string
  description: string
  termType: TermTypeId
  attrs: TermAttrs
}

let session: Session | null = null
let vueApp: App | null = null
let rootEl: HTMLDivElement | null = null
/** 从哪个弹窗打开：贴其右侧 */
let openBeside: CascadeAnchor | null = null
let hostRef: {
  flash: () => void
  setZIndex: (z: number) => void
  bringFront: () => number
  getBoundingClientRect: () => DOMRect | null
} | null = null

function sessionKey(s: Session): string {
  if (s.mode === 'create') return `create:${s.insertPos}`
  if (s.mode === 'edit') return `edit:${s.title}`
  return `catalog:${s.title}`
}

function teardownMount() {
  unregisterCascadeFloat(CASCADE_ID)
  if (vueApp) {
    try {
      vueApp.unmount()
    } catch {
      // ignore
    }
    vueApp = null
  }
  rootEl?.remove()
  rootEl = null
  hostRef = null
}

function discardSession() {
  session = null
  openBeside = null
}

function present() {
  const s = session
  if (!s) return
  ensureTermGlossaryStyles()
  teardownMount()

  const root = document.createElement('div')
  root.className = 'ext-term-editor-float-root'
  document.body.appendChild(root)
  rootEl = root

  const isCreate = s.mode === 'create'
  const place = allocateCascadePlace({
    width: EDITOR_W,
    height: EDITOR_H,
    besideRect: openBeside,
  })
  openBeside = null
  const z = nextFloatZIndex()
  const remarkId =
    s.mode === 'create' ? '' : String(s.remarkId || '').trim()
  vueApp = createApp(TermEditorFloatHost, {
    mode: isCreate ? 'create' : 'edit',
    initialTitle: isCreate ? '' : s.title,
    initialDescription: isCreate ? '' : s.description,
    initialType: s.termType,
    initialAttrs: s.attrs,
    remarkId,
    floatLeft: place.left,
    floatTop: place.top,
    zIndex: z,
    onConfirm: (payload: ConfirmPayload) => {
      void handleConfirm(payload)
    },
    onCancel: () => {
      closeDiscard()
    },
    onFocus: () => {
      hostRef?.setZIndex(nextFloatZIndex())
    },
  })

  const pinia = getActivePinia()
  if (pinia) vueApp.use(pinia)
  vueApp.use(ElementPlus, { locale: zhCn })
  const instance = vueApp.mount(root) as {
    flash?: () => void
    setZIndex?: (z: number) => void
    bringFront?: () => number
    getBoundingClientRect?: () => DOMRect | null
  }
  hostRef = {
    flash: () => instance.flash?.(),
    setZIndex: (next) => instance.setZIndex?.(next),
    bringFront: () => instance.bringFront?.() ?? nextFloatZIndex(),
    getBoundingClientRect: () => instance.getBoundingClientRect?.() ?? null,
  }
  registerCascadeFloat(CASCADE_ID, () => hostRef?.getBoundingClientRect() ?? null)
}

function closeDiscard() {
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
  termType: TermTypeId
  attrs: TermAttrs
  sourcePath: string
}) {
  const store = useGlossaryStore()
  const prev = store.getTerm(opts.title)
  const terms = {
    ...store.terms,
    [opts.title]: prev
      ? {
          ...prev,
          description: opts.description,
          type: opts.termType,
          attrs: opts.attrs,
          sourcePath: opts.sourcePath || prev.sourcePath || '',
        }
      : {
          title: opts.title,
          description: opts.description,
          sourcePath: opts.sourcePath || '',
          type: opts.termType,
          attrs: opts.attrs,
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
    termType: TermTypeId
    attrs: TermAttrs
  },
) {
  const store = useGlossaryStore()
  const oldTitle = sanitizeTermTitle(s.title)
  const { title, description, termType, attrs } = payload
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
        termType,
        attrs,
        sourcePath,
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
        termType,
        attrs,
        sourcePath: '',
      })
    } else {
      await persistCatalogFields({
        title,
        description,
        termType,
        attrs,
        sourcePath: '',
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
  const s = session
  if (!s) return

  const title = sanitizeTermTitle(payload.title)
  const peeled = peelRemarkBraceFromDescription(
    String(payload.description ?? '').replace(/\u00a0/g, ' '),
  )
  const description = peeled.description.trim()
  const termType = normalizeTermType(payload.termType)
  const attrs = normalizeTermAttrs(termType, payload.attrs)
  if (!title) {
    await alertError('请填写词条标题')
    return
  }
  if (!description) {
    await alertError('请填写词条描述')
    return
  }

  if (s.mode === 'catalog-edit') {
    await handleCatalogConfirm(s, { title, description, termType, attrs })
    return
  }

  const editor = s.editor
  if (editor.isDestroyed) {
    closeDiscard()
    return
  }

  const store = useGlossaryStore()

  if (s.mode === 'create') {
    if (store.getTerm(title)) {
      await alertError(`词条「${title}」已存在`)
      return
    }
    const ok = insertTermDefinition(editor, {
      title,
      description,
      termType,
      at: s.insertPos,
    })
    if (!ok) {
      await alertError('插入词条失败')
      return
    }
    try {
      const terms = { ...store.terms }
      terms[title] = {
        title,
        description,
        sourcePath: '',
        type: termType,
        attrs,
        ignoreContexts: [],
        formerTitles: [],
        pendingManualConfirm: [],
      }
      await store.persistTerms(terms)
    } catch (err) {
      console.warn('[term-editor] persist create failed:', err)
    }
    requestSaveCurrentFile()
    closeAfterConfirm()
    return
  }

  // edit（当前文档定义块）
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
      termType,
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
      const terms = {
        ...store.terms,
        [title]: prev
          ? { ...prev, description, type: termType, attrs }
          : {
              title,
              description,
              sourcePath: '',
              type: termType,
              attrs,
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
    termType,
  })
  if (!replaced) {
    await alertError('更新词条失败')
    return
  }
  try {
    const prev = store.getTerm(title)
    const terms = {
      ...store.terms,
      [title]: prev
        ? { ...prev, description, type: termType, attrs }
        : {
            title,
            description,
            sourcePath: '',
            type: termType,
            attrs,
            ignoreContexts: [],
            formerTitles: [],
            pendingManualConfirm: [],
          },
    }
    await store.persistTerms(terms)
  } catch (err) {
    console.warn('[term-editor] persist edit failed:', err)
  }
  requestSaveCurrentFile()
  closeAfterConfirm()
}


function openSession(
  next: Session,
  besideRect?: CascadeAnchor | null,
) {
  // 同一编辑会话已打开：置顶 + 闪烁，不重挂（避免丢未保存草稿）
  if (session && vueApp && hostRef && sessionKey(session) === sessionKey(next)) {
    hostRef.bringFront()
    return
  }
  session = next
  openBeside = besideRect ?? null
  present()
}

/** 选类型后：浮层新建（正文暂不插入） */
export function openTermEditorCreate(opts: {
  editor: Editor
  termType?: TermTypeId | string
  insertPos: number
}) {
  if (opts.editor.isDestroyed) return
  const termType = normalizeTermType(opts.termType ?? TERM_TYPE_BASIC)
  openSession({
    mode: 'create',
    editor: opts.editor,
    termType,
    attrs: normalizeTermAttrs(termType, {}),
    insertPos: opts.insertPos,
  })
}

/** 从定义块打开编辑 */
export function openTermEditorEdit(opts: {
  editor: Editor
  nodePos: number
}) {
  const { editor } = opts
  if (editor.isDestroyed) return
  const nodePos = repairTermRemarkLeak(editor, opts.nodePos)
  const node = editor.state.doc.nodeAt(nodePos)
  if (!node || node.type.name !== 'termGlossary') return
  const title = sanitizeTermTitle(node.attrs.title) || String(node.attrs.title ?? '')
  const description = serializeTermDescriptionFromNode(node)
  const remarkId = getTermRemarkIdFromNode(node)
  const stored = title ? useGlossaryStore().getTerm(title) : null
  const termType = normalizeTermType(
    node.attrs.termType || stored?.type || TERM_TYPE_BASIC,
  )
  openSession({
    mode: 'edit',
    editor,
    termType,
    nodePos,
    title,
    description,
    attrs: normalizeTermAttrs(termType, stored?.attrs),
    remarkId,
  })
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
  const termType = normalizeTermType(stored.type || TERM_TYPE_BASIC)
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
      termType,
      attrs: normalizeTermAttrs(termType, stored.attrs),
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
