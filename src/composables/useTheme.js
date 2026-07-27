import { computed, ref, watch } from 'vue'
import { appConfig, loadAppConfig, patchAppConfig } from './useAppConfig'

const MODES = ['system', 'light', 'dark']

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(pref, isSystemDark) {
  if (pref === 'system') return isSystemDark ? 'dark' : 'light'
  return pref
}

function applyTheme(resolved) {
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  root.style.colorScheme = resolved
  root.classList.toggle('dark', resolved === 'dark')
}

const preference = computed({
  get: () => appConfig.value.theme,
  set: (mode) => {
    if (!MODES.includes(mode)) return
    void patchAppConfig({ theme: mode })
  },
})

const systemDark = ref(typeof window !== 'undefined' ? getSystemDark() : false)

let mediaBound = false

function bindSystemListener() {
  if (mediaBound || typeof window === 'undefined') return
  mediaBound = true
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mq.matches
  mq.addEventListener('change', (e) => {
    systemDark.value = e.matches
  })
}

const resolvedTheme = computed(() =>
  resolveTheme(preference.value, systemDark.value),
)

watch(resolvedTheme, (theme) => applyTheme(theme), { immediate: true })

export async function initTheme() {
  bindSystemListener()
  await loadAppConfig()
  applyTheme(resolvedTheme.value)
}

export function useTheme() {
  bindSystemListener()

  function setTheme(mode) {
    if (!MODES.includes(mode)) return
    void patchAppConfig({ theme: mode })
  }

  return {
    preference,
    resolvedTheme,
    setTheme,
    modes: MODES,
  }
}
