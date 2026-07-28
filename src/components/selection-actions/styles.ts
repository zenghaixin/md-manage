const STYLE_ATTR = 'data-ext-selection-actions'
const STYLE_ID = 'selection-actions'

const CSS = `
.ext-selection-bubble {
  position: fixed;
  z-index: 10020;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 8px;
  background: var(--surface, #f4f7f9);
  box-shadow: 0 8px 20px rgba(26, 40, 48, 0.14);
  pointer-events: auto;
}

.ext-selection-bubble-item {
  margin: 0;
  padding: 0.3rem 0.65rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ink, #1a2830);
  font-size: 0.8125rem;
  cursor: pointer;
}

.ext-selection-bubble-item:hover {
  background: color-mix(in srgb, var(--surface-hover, #e8eef2) 80%, transparent);
  color: var(--accent, #0d9488);
}
`

export function ensureSelectionActionStyles(): void {
  if (typeof document === 'undefined') return
  let el = document.querySelector(
    `style[${STYLE_ATTR}="${STYLE_ID}"]`,
  ) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.setAttribute(STYLE_ATTR, STYLE_ID)
    document.head.appendChild(el)
  }
  el.textContent = CSS
}
