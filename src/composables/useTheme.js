import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'docs-theme'
const MODES = ['system', 'light', 'dark']

function readStoredPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (MODES.includes(saved)) return saved
  } catch {
    // ignore storage errors
  }
  return 'system'
}

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

const preference = ref(readStoredPreference())
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

const resolvedTheme = computed(() => resolveTheme(preference.value, systemDark.value))

watch(
  resolvedTheme,
  (theme) => applyTheme(theme),
  { immediate: true },
)

watch(preference, (pref) => {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // ignore storage errors
  }
})

export function initTheme() {
  bindSystemListener()
  applyTheme(resolvedTheme.value)
}

export function useTheme() {
  bindSystemListener()

  function setTheme(mode) {
    if (!MODES.includes(mode)) return
    preference.value = mode
  }

  return {
    preference,
    resolvedTheme,
    setTheme,
    modes: MODES,
  }
}
