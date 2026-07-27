import { ref } from 'vue'
import { api } from '../api'

const MODES = ['system', 'light', 'dark']

/** @type {import('vue').Ref<{ theme: string, rightPanelActiveModuleId: string }>} */
export const appConfig = ref({
  theme: 'system',
  rightPanelActiveModuleId: '',
})

let loaded = false
let loadPromise = null

function normalizeConfig(raw) {
  const theme = MODES.includes(raw?.theme) ? raw.theme : 'system'
  return {
    theme,
    rightPanelActiveModuleId: String(raw?.rightPanelActiveModuleId || ''),
  }
}

export async function loadAppConfig() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      const data = await api.getAppConfig()
      appConfig.value = normalizeConfig(data)
    } catch (err) {
      console.warn('[app-config] load failed:', err)
      // 回退：若仍有旧 localStorage 主题则迁一次
      try {
        const legacy = localStorage.getItem('docs-theme')
        if (MODES.includes(legacy)) {
          appConfig.value = normalizeConfig({ theme: legacy })
          await api.patchAppConfig({ theme: legacy }).catch(() => {})
          localStorage.removeItem('docs-theme')
        }
      } catch {
        // ignore
      }
    } finally {
      loaded = true
    }
    return appConfig.value
  })()
  return loadPromise
}

export async function patchAppConfig(partial) {
  const next = normalizeConfig({ ...appConfig.value, ...partial })
  appConfig.value = next
  try {
    const saved = await api.patchAppConfig(next)
    appConfig.value = normalizeConfig(saved)
  } catch (err) {
    console.warn('[app-config] save failed:', err)
  }
  return appConfig.value
}

export function isAppConfigLoaded() {
  return loaded
}
