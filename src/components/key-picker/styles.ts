/**
 * 编辑器快捷键气泡样式（与具体扩展无关）。
 * 英文冒号「:」后补 padding-left；中文「：」不加。
 */
import { KEY_PICKER_CLASS } from './constants'

const STYLE_ATTR = 'data-ed-key-picker-style'

export const KEY_PICKER_STYLES = `
.${KEY_PICKER_CLASS} {
  position: fixed;
  z-index: 10020;
  min-width: 140px;
  max-width: 280px;
  padding: 0.35rem 0.4rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 8px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  box-shadow: 0 10px 28px rgba(26, 40, 48, 0.16);
  font-size: 0.75rem;
}

.${KEY_PICKER_CLASS}-label {
  padding: 0.1rem 0.25rem 0.3rem;
  color: var(--muted, #5a6b75);
  font-size: 0.6875rem;
}

.${KEY_PICKER_CLASS}-list {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.${KEY_PICKER_CLASS}-item {
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
  margin: 0;
  padding: 0.25rem 0.35rem;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.3;
}

.${KEY_PICKER_CLASS}-item.is-muted {
  color: var(--muted, #5a6b75);
}

.${KEY_PICKER_CLASS}-item:hover {
  background: color-mix(in srgb, #2563eb 12%, transparent);
  color: #2563eb;
}

.${KEY_PICKER_CLASS}-item.is-active {
  background: color-mix(in srgb, #2563eb 16%, transparent);
  color: #2563eb;
}

.${KEY_PICKER_CLASS}--passive {
  pointer-events: none;
}

.${KEY_PICKER_CLASS}--passive .${KEY_PICKER_CLASS}-item,
.${KEY_PICKER_CLASS}--passive .${KEY_PICKER_CLASS}-foot .${KEY_PICKER_CLASS}-item {
  pointer-events: auto;
}

.${KEY_PICKER_CLASS}-hotkey {
  flex: 0 0 auto;
  min-width: 0;
  margin-right: 0;
  color: inherit;
  font-size: inherit;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.${KEY_PICKER_CLASS}-hotkey + span {
  padding-left: 0.35em;
}

.${KEY_PICKER_CLASS}-foot {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.15rem;
  margin-top: 0.3rem;
  padding-top: 0.3rem;
  border-top: 1px solid color-mix(in srgb, var(--border, #c5d0d8) 80%, transparent);
}

.${KEY_PICKER_CLASS}-hint {
  flex: 1 1 100%;
  padding: 0.05rem 0.3rem 0.15rem;
  color: var(--muted, #5a6b75);
  font-size: 0.6875rem;
}

.${KEY_PICKER_CLASS}--armed .${KEY_PICKER_CLASS}-hint {
  display: none;
}

.${KEY_PICKER_CLASS}-foot .${KEY_PICKER_CLASS}-item {
  width: auto;
  flex: 0 0 auto;
  padding: 0.15rem 0.3rem;
  white-space: nowrap;
  font-size: 0.6875rem;
}

html.dark .${KEY_PICKER_CLASS},
[data-theme='dark'] .${KEY_PICKER_CLASS} {
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}
`

export function ensureKeyPickerStyles(css: string = KEY_PICKER_STYLES): void {
  if (typeof document === 'undefined') return
  let el = document.querySelector(
    `style[${STYLE_ATTR}]`,
  ) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.setAttribute(STYLE_ATTR, '1')
    document.head.appendChild(el)
  }
  el.textContent = css
}
