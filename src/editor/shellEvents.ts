/**
 * 壳层通用事件总线。
 * 扩展需要「打开某个文档」等壳能力时，通过事件请求，DocsPage 等壳组件统一响应。
 * 禁止扩展直接改 DocsPage 的 activeTab / activeFile。
 */

export type OpenFilePayload = { tab: string; file: string }

type Handler<T> = (payload: T) => void

const openFileHandlers = new Set<Handler<OpenFilePayload>>()
const reloadFileHandlers = new Set<Handler<OpenFilePayload>>()
const saveCurrentHandlers = new Set<() => void | Promise<void>>()

function parseSourcePath(sourcePath: string): OpenFilePayload | null {
  const path = String(sourcePath || '').trim()
  const slash = path.indexOf('/')
  if (slash <= 0 || slash >= path.length - 1) return null
  return {
    tab: path.slice(0, slash),
    file: path.slice(slash + 1),
  }
}

/** 请求打开文档（tab/file） */
export function requestOpenFile(payload: OpenFilePayload): void {
  const tab = String(payload?.tab || '').trim()
  const file = String(payload?.file || '').trim()
  if (!tab || !file) return
  for (const handler of openFileHandlers) {
    try {
      handler({ tab, file })
    } catch (err) {
      console.warn('[shellEvents] open-file handler failed:', err)
    }
  }
}

/** 从 `tab/file.md` 形式的路径打开 */
export function requestOpenFilePath(sourcePath: string): void {
  const parsed = parseSourcePath(sourcePath)
  if (parsed) requestOpenFile(parsed)
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
  const tab = String(payload?.tab || '').trim()
  const file = String(payload?.file || '').trim()
  if (!tab || !file) return
  for (const handler of reloadFileHandlers) {
    try {
      handler({ tab, file })
    } catch (err) {
      console.warn('[shellEvents] reload-file handler failed:', err)
    }
  }
}

export function requestReloadFilePath(sourcePath: string): void {
  const parsed = parseSourcePath(sourcePath)
  if (parsed) requestReloadFile(parsed)
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
