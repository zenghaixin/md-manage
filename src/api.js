async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    const hint =
      data.error ||
      (res.status === 404
        ? `接口不存在 (${url})，请重启 API：npm run dev`
        : text?.slice?.(0, 120) || `请求失败 (${res.status})`)
    throw new Error(hint)
  }
  return data
}

function filePathOf(tab, file) {
  const t = String(tab || '').trim()
  const f = String(file || '').trim()
  if (t && f) return `${t}/${f}`
  return f || t || ''
}

export const api = {
  getTree: () => request('/api/tree'),

  createFolder: (parentPath, name) =>
    request('/api/tree/folders', {
      method: 'POST',
      body: JSON.stringify({ parentPath: parentPath || '', name }),
    }),
  renameFolder: (pathRel, name) =>
    request('/api/tree/folders', {
      method: 'PATCH',
      body: JSON.stringify({ path: pathRel, name }),
    }),
  deleteFolder: (pathRel) =>
    request('/api/tree/folders', {
      method: 'DELETE',
      body: JSON.stringify({ path: pathRel }),
    }),

  createFileIn: (parentPath, name) =>
    request('/api/tree/files', {
      method: 'POST',
      body: JSON.stringify({ parentPath, name }),
    }),
  getFileByPath: (pathRel) =>
    request(`/api/tree/file?path=${encodeURIComponent(pathRel)}`),
  saveFileByPath: (pathRel, content) =>
    request('/api/tree/file', {
      method: 'PUT',
      body: JSON.stringify({ path: pathRel, content }),
    }),
  renameFileByPath: (pathRel, name) =>
    request('/api/tree/file', {
      method: 'PATCH',
      body: JSON.stringify({ path: pathRel, name }),
    }),
  deleteFileByPath: (pathRel) =>
    request('/api/tree/file', {
      method: 'DELETE',
      body: JSON.stringify({ path: pathRel }),
    }),

  moveTreeEntry: (fromPath, toParentPath, toIndex = -1) =>
    request('/api/tree/move', {
      method: 'POST',
      body: JSON.stringify({ fromPath, toParentPath, toIndex }),
    }),

  // —— 兼容旧 tab/file 调用（file 可含嵌套子路径）——
  getTabs: async () => {
    const { tree } = await request('/api/tree')
    return {
      tabs: (tree || []).filter((n) => n.type === 'folder').map((n) => n.name),
    }
  },
  createTab: (name) =>
    request('/api/tree/folders', {
      method: 'POST',
      body: JSON.stringify({ parentPath: '', name }),
    }),
  deleteTab: (tab) =>
    request('/api/tree/folders', {
      method: 'DELETE',
      body: JSON.stringify({ path: tab }),
    }),
  renameTab: (tab, name) =>
    request('/api/tree/folders', {
      method: 'PATCH',
      body: JSON.stringify({ path: tab, name }),
    }),
  getFiles: async (tab) => {
    const { tree } = await request('/api/tree')
    const folder = (tree || []).find((n) => n.type === 'folder' && n.name === tab)
    const files = []
    const walk = (nodes, prefix) => {
      for (const n of nodes || []) {
        if (n.type === 'file') {
          const rel = prefix ? `${prefix}/${n.name}` : n.name
          files.push(rel)
        } else if (n.type === 'folder') {
          walk(n.children, prefix ? `${prefix}/${n.name}` : n.name)
        }
      }
    }
    walk(folder?.children || [], '')
    return { files }
  },
  createFile: (tab, name) =>
    request('/api/tree/files', {
      method: 'POST',
      body: JSON.stringify({ parentPath: tab, name }),
    }),
  getFile: (tab, file) =>
    request(`/api/tree/file?path=${encodeURIComponent(filePathOf(tab, file))}`),
  saveFile: (tab, file, content) =>
    request('/api/tree/file', {
      method: 'PUT',
      body: JSON.stringify({ path: filePathOf(tab, file), content }),
    }),
  renameFile: (tab, file, name) =>
    request('/api/tree/file', {
      method: 'PATCH',
      body: JSON.stringify({ path: filePathOf(tab, file), name }),
    }),
  deleteFile: (tab, file) =>
    request('/api/tree/file', {
      method: 'DELETE',
      body: JSON.stringify({ path: filePathOf(tab, file) }),
    }),

  getGlossary: () => request('/api/glossary'),
  getGlossaryIndex: () => request('/api/glossary/index'),
  getGlossaryEntries: () => request('/api/glossary/entries'),
  getGlossaryFileTerms: (pathRel) =>
    request(
      `/api/glossary/file-terms?path=${encodeURIComponent(String(pathRel || ''))}`,
    ),
  getGlossarySchema: (pathRel) =>
    request(
      `/api/glossary/schema?path=${encodeURIComponent(String(pathRel || ''))}`,
    ),
  putGlossarySchema: (pathRel, schema) =>
    request('/api/glossary/schema', {
      method: 'PUT',
      body: JSON.stringify({ path: pathRel, schema }),
    }),
  putGlossary: (body) =>
    request('/api/glossary', { method: 'PUT', body: JSON.stringify(body) }),
  syncGlossary: () => request('/api/glossary/sync', { method: 'POST' }),
  patchGlossaryFile: (body) =>
    request('/api/glossary/file', { method: 'PATCH', body: JSON.stringify(body) }),
  renameGlossarySync: (body) =>
    request('/api/glossary/rename-sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  glossaryHasConfirmedRef: (title) =>
    request(
      `/api/glossary/has-confirmed-ref?title=${encodeURIComponent(String(title || ''))}`,
    ),
  applyGlossaryConflicts: (body) =>
    request('/api/glossary/apply-conflicts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getAppConfig: () => request('/api/app-config'),
  patchAppConfig: (body) =>
    request('/api/app-config', {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    }),
}
