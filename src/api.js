async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`)
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
}
