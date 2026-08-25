/**
 * 壳层通用事件总线。
 * 扩展需要「打开某个文档」等壳能力时，通过事件请求，DocsPage 等壳组件统一响应。
 * 路径均为相对 md 根的完整路径，如 `文件夹/a.md` 或根级 `a.md`。
 */

export type OpenFilePayload = { path: string }

export type OpenRightPanelPayload = {
  /** 指定激活的模块 id；空则按配置/默认解析 */
  moduleId?: string
  /** @deprecated 标题改由模块书签表达 */
  title?: string
  onReady?: (host: HTMLElement) => void
}

type Handler<T> = (payload: T) => void

const openFileHandlers = new Set<Handler<OpenFilePayload>>()
const reloadFileHandlers = new Set<Handler<OpenFilePayload>>()
const saveCurrentHandlers = new Set<() => void | Promise<void>>()
const openRightPanelHandlers = new Set<Handler<OpenRightPanelPayload>>()
const closeRightPanelHandlers = new Set<() => void>()
const rightPanelDismissHandlers = new Set<() => void>()

let rightPanelHost: HTMLElement | null = null

/** 选区气泡等手势期间禁止切文件，避免 mouseup 穿透导致重载冲掉未保存编辑 */
let uiGestureLockCount = 0
let uiGestureLockTimer: ReturnType<typeof setTimeout> | null = null

export function beginUiGestureLock(ms = 400): void {
  uiGestureLockCount += 1
  if (uiGestureLockTimer != null) clearTimeout(uiGestureLockTimer)
  uiGestureLockTimer = setTimeout(() => {
    uiGestureLockTimer = null
    uiGestureLockCount = 0
  }, Math.max(50, ms))
}

export function isUiGestureLocked(): boolean {
  return uiGestureLockCount > 0
}

export function endUiGestureLock(): void {
  if (uiGestureLockTimer != null) {
    clearTimeout(uiGestureLockTimer)
    uiGestureLockTimer = null
  }
  uiGestureLockCount = 0
}

function normPath(sourcePath: string): string {
  return String(sourcePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

/** 壳层当前打开的文档路径（相对 md 根）；扩展可读，勿写业务逻辑 */
let activeDocPath = ''

export function setActiveDocPath(path: string): void {
  activeDocPath = normPath(path)
}

export function getActiveDocPath(): string {
  return activeDocPath
}

/** 请求打开文档（完整相对路径） */
export function requestOpenFile(payload: OpenFilePayload): void {
  if (isUiGestureLocked()) {
    console.warn('[shellEvents] open-file ignored during ui gesture lock')
    return
  }
  const path = normPath(payload?.path)
  if (!path) return
  for (const handler of openFileHandlers) {
    try {
      handler({ path })
    } catch (err) {
      console.warn('[shellEvents] open-file handler failed:', err)
    }
  }
}

/** 从相对路径打开（支持根级 `file.md` 与嵌套 `a/b/c.md`） */
export function requestOpenFilePath(sourcePath: string): void {
  const path = normPath(sourcePath)
  if (path) requestOpenFile({ path })
}

/** DocsPage 等注册监听；返回取消函数 */
export function onOpenFileRequest(handler: Handler<OpenFilePayload>): () => void {
  openFileHandlers.add(handler)
  return () => {
    openFileHandlers.delete(handler)
  }
}

/** 请求重新加载已打开的文档内容（扩展改写了磁盘文件后） */
export function requestReloadFile(payload: OpenFilePayload): void {
  if (isUiGestureLocked()) {
    console.warn('[shellEvents] reload-file ignored during ui gesture lock')
    return
  }
  const path = normPath(payload?.path)
  if (!path) return
  for (const handler of reloadFileHandlers) {
    try {
      handler({ path })
    } catch (err) {
      console.warn('[shellEvents] reload-file handler failed:', err)
    }
  }
}

export function requestReloadFilePath(sourcePath: string): void {
  const path = normPath(sourcePath)
  if (path) requestReloadFile({ path })
}

/** MarkdownEditor 注册：当前文件被外部改写时重新拉取 */
export function onReloadFileRequest(handler: Handler<OpenFilePayload>): () => void {
  reloadFileHandlers.add(handler)
  return () => {
    reloadFileHandlers.delete(handler)
  }
}

/** 请求保存当前打开的文档（扩展改名等需要先落盘再全库扫描） */
export async function requestSaveCurrentFile(): Promise<void> {
  const handlers = Array.from(saveCurrentHandlers)
  for (const handler of handlers) {
    try {
      await handler()
    } catch (err) {
      console.warn('[shellEvents] save-current handler failed:', err)
      throw err
    }
  }
}

/** MarkdownEditor 注册：强制把当前编辑器内容写盘 */
export function onSaveCurrentFileRequest(
  handler: () => void | Promise<void>,
): () => void {
  saveCurrentHandlers.add(handler)
  return () => {
    saveCurrentHandlers.delete(handler)
  }
}

/** DocsPage 注册右侧操作区 host */
export function setRightPanelHost(el: HTMLElement | null): void {
  rightPanelHost = el
}

export function getRightPanelHost(): HTMLElement | null {
  return rightPanelHost
}

/** 扩展请求打开右侧面板（可选指定模块） */
export function requestOpenRightPanel(payload: OpenRightPanelPayload = {}): void {
  for (const handler of openRightPanelHandlers) {
    try {
      handler(payload)
    } catch (err) {
      console.warn('[shellEvents] open-right-panel handler failed:', err)
    }
  }
}

/** 扩展或内容区请求关闭右侧操作区 */
export function requestCloseRightPanel(): void {
  for (const handler of closeRightPanelHandlers) {
    try {
      handler()
    } catch (err) {
      console.warn('[shellEvents] close-right-panel handler failed:', err)
    }
  }
}

export function onOpenRightPanelRequest(
  handler: Handler<OpenRightPanelPayload>,
): () => void {
  openRightPanelHandlers.add(handler)
  return () => {
    openRightPanelHandlers.delete(handler)
  }
}

export function onCloseRightPanelRequest(handler: () => void): () => void {
  closeRightPanelHandlers.add(handler)
  return () => {
    closeRightPanelHandlers.delete(handler)
  }
}

/**
 * 用户通过壳层开关收起右栏时通知扩展做清理。
 * 扩展主动 requestCloseRightPanel 时不要再调 notify，避免重复。
 */
export function onRightPanelDismiss(handler: () => void): () => void {
  rightPanelDismissHandlers.add(handler)
  return () => {
    rightPanelDismissHandlers.delete(handler)
  }
}

export function notifyRightPanelDismiss(): void {
  for (const handler of Array.from(rightPanelDismissHandlers)) {
    try {
      handler()
    } catch (err) {
      console.warn('[shellEvents] right-panel dismiss handler failed:', err)
    }
  }
}

const rightPanelOpenedHandlers = new Set<() => void>()

/** 右栏变为展开时（含用户点凸耳），扩展可恢复待处理内容 */
export function onRightPanelOpened(handler: () => void): () => void {
  rightPanelOpenedHandlers.add(handler)
  return () => {
    rightPanelOpenedHandlers.delete(handler)
  }
}

export function notifyRightPanelOpened(): void {
  for (const handler of Array.from(rightPanelOpenedHandlers)) {
    try {
      handler()
    } catch (err) {
      console.warn('[shellEvents] right-panel opened handler failed:', err)
    }
  }
}

/** 文档大纲标题项（由编辑器从当前文档提取） */
export type OutlineHeading = {
  id: string
  level: number
  text: string
  /** ProseMirror 文档位置；源码模式可用 line 兜底 */
  pos: number
  /** 源码模式：1-based 行号 */
  line?: number
}

export type ScrollToHeadingPayload = {
  pos: number
  line?: number
}

let currentOutline: OutlineHeading[] = []
const outlineHandlers = new Set<Handler<OutlineHeading[]>>()
const scrollToHeadingHandlers = new Set<Handler<ScrollToHeadingPayload>>()

/** 编辑器发布当前文档大纲；侧栏订阅展示 */
export function publishDocumentOutline(headings: OutlineHeading[]): void {
  currentOutline = Array.isArray(headings) ? headings : []
  for (const handler of Array.from(outlineHandlers)) {
    try {
      handler(currentOutline)
    } catch (err) {
      console.warn('[shellEvents] outline handler failed:', err)
    }
  }
}

export function getDocumentOutline(): OutlineHeading[] {
  return currentOutline
}

/** 侧栏注册；返回取消函数。注册时立即推送当前缓存。 */
export function onDocumentOutlineChanged(
  handler: Handler<OutlineHeading[]>,
): () => void {
  outlineHandlers.add(handler)
  try {
    handler(currentOutline)
  } catch (err) {
    console.warn('[shellEvents] outline handler failed:', err)
  }
  return () => {
    outlineHandlers.delete(handler)
  }
}

/** 侧栏点击大纲项 → 编辑器滚动并定位 */
export function requestScrollToHeading(payload: ScrollToHeadingPayload): void {
  if (payload == null || typeof payload.pos !== 'number') return
  for (const handler of Array.from(scrollToHeadingHandlers)) {
    try {
      handler(payload)
    } catch (err) {
      console.warn('[shellEvents] scroll-to-heading handler failed:', err)
    }
  }
}

/** MarkdownEditor 注册 */
export function onScrollToHeadingRequest(
  handler: Handler<ScrollToHeadingPayload>,
): () => void {
  scrollToHeadingHandlers.add(handler)
  return () => {
    scrollToHeadingHandlers.delete(handler)
  }
}
