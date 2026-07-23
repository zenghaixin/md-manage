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

export const api = {
  getTabs: () => request('/api/tabs'),
  createTab: (name) =>
    request('/api/tabs', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteTab: (tab) => request(`/api/tabs/${encodeURIComponent(tab)}`, { method: 'DELETE' }),
  getFiles: (tab) => request(`/api/tabs/${encodeURIComponent(tab)}/files`),
  createFile: (tab, name) =>
    request(`/api/tabs/${encodeURIComponent(tab)}/files`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getFile: (tab, file) =>
    request(`/api/tabs/${encodeURIComponent(tab)}/files/${encodeURIComponent(file)}`),
  saveFile: (tab, file, content) =>
    request(`/api/tabs/${encodeURIComponent(tab)}/files/${encodeURIComponent(file)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  renameFile: (tab, file, name) =>
    request(`/api/tabs/${encodeURIComponent(tab)}/files/${encodeURIComponent(file)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteFile: (tab, file) =>
    request(`/api/tabs/${encodeURIComponent(tab)}/files/${encodeURIComponent(file)}`, {
      method: 'DELETE',
    }),

  getGlossary: () => request('/api/glossary'),
  /** 整表写回（含 ignoreContexts / formerTitles） */
  putGlossary: (body) =>
    request('/api/glossary', { method: 'PUT', body: JSON.stringify(body) }),
  /** 扫描全部 .md 并与 glossary.json 校验同步 */
  syncGlossary: () => request('/api/glossary/sync', { method: 'POST' }),
  /**
   * 按文件更新词条
   * @param {{ sourcePath: string, terms: Array<{ title: string, description: string }> }} body
   */
  patchGlossaryFile: (body) =>
    request('/api/glossary/file', { method: 'PATCH', body: JSON.stringify(body) }),
  /** 改名后同步已确认引用并返回冲突列表 */
  renameGlossarySync: (body) =>
    request('/api/glossary/rename-sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** 批量应用冲突：确认 term[] / 写入 ignoreContexts */
  applyGlossaryConflicts: (body) =>
    request('/api/glossary/apply-conflicts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
