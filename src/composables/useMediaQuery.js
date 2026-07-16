import { onMounted, onUnmounted, ref } from 'vue'

export function useMediaQuery(query) {
  const matches = ref(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  let mql = null

  function onChange(e) {
    matches.value = e.matches
  }

  onMounted(() => {
    mql = window.matchMedia(query)
    matches.value = mql.matches
    mql.addEventListener('change', onChange)
  })

  onUnmounted(() => {
    mql?.removeEventListener('change', onChange)
  })

  return matches
}
