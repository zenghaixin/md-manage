/**
 * 词条定义目录约定（客户端）。
 * 定义块只认该目录；引用仍可出现在任意 md。
 */
export const GLOSSARY_ROOT_FOLDER = '词条'
export const GLOSSARY_DEFAULT_FILE = '词条/词条.md'

export function normalizeDocPath(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

/** 是否为词条定义目录或其下文件 */
export function isGlossaryDefPath(path: string): boolean {
  const p = normalizeDocPath(path)
  if (!p) return false
  return p === GLOSSARY_ROOT_FOLDER || p.startsWith(`${GLOSSARY_ROOT_FOLDER}/`)
}
