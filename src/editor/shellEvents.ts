/**
 * 壳层通用事件总线。
 * 扩展需要「打开某个文档」等壳能力时，通过事件请求，DocsPage 等壳组件统一响应。
 * 路径均为相对 md 根的完整路径，如 `文件夹/a.md` 或根级 `a.md`。
 */

export type OpenFilePayload = { path: string }

type Handler<T> = (payload: T) => void

const openFileHandlers = new Set<Handler<OpenFilePayload>>()
const reloadFileHandlers = new Set<Handler<OpenFilePayload>>()
const saveCurrentHandlers = new Set<() => void | Promise<void>>()

function normPath(sourcePath: string): string {
  return String(sourcePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

/** 请求打开文档（完整相对路径） */
export function requestOpenFile(payload: OpenFilePayload): void {
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
