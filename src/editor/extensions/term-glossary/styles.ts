/**
 * term-glossary 编辑态样式。
 * 标题与描述默认换行：标题一行，描述从下一行开始。
 */
import { TERM_GLOSSARY_ID } from './constants'

const STYLE_ATTR = 'data-ext-style'

export const TERM_GLOSSARY_STYLES = `
.ext-term-node {
  display: block;
  margin: 0.35em 0 16px;
  padding-left: 0.55em;
  border-left: 2px solid color-mix(in srgb, currentColor 28%, transparent);
  cursor: default;
}

.ext-term-node.is-selected {
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-left-color: color-mix(in srgb, currentColor 55%, transparent);
}

.ext-term-header {
  display: block;
}

.ext-term-label {
  display: none;
}

.ext-term-title {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-weight: 700;
  color: inherit;
  outline: none;
  min-height: 1.2em;
  line-height: inherit;
  cursor: text;
}

.ext-term-title::placeholder {
  color: var(--muted, #94a3b8);
  font-weight: 500;
  opacity: 1;
}

.ext-term-desc {
  display: block;
  margin-top: 0.15em;
  min-height: 1.2em;
  font-weight: inherit;
  color: inherit;
  cursor: text;
}

.ext-term-desc > p {
  margin: 0.35em 0;
  min-height: 1.2em;
}

.ext-term-desc > p:first-child {
  margin-top: 0;
}

.ext-term-desc > p:last-child {
  margin-bottom: 0;
}

.ext-term-desc br {
  display: block;
  content: '';
  margin-top: 0.35em;
}

/* 描述区内 Markdown 块级样式 */
.ext-term-desc h1,
.ext-term-desc h2,
.ext-term-desc h3,
.ext-term-desc h4 {
  margin: 0.55em 0 0.35em;
  font-weight: 700;
  line-height: 1.35;
  color: inherit;
}

.ext-term-desc h1 { font-size: 1.25em; }
.ext-term-desc h2 { font-size: 1.15em; }
.ext-term-desc h3 { font-size: 1.05em; }
.ext-term-desc h4 { font-size: 1em; }

.ext-term-desc h1:first-child,
.ext-term-desc h2:first-child,
.ext-term-desc h3:first-child,
.ext-term-desc h4:first-child {
  margin-top: 0;
}

.ext-term-desc strong {
  font-weight: 700;
}

.ext-term-desc em {
  font-style: italic;
}

.ext-term-desc ul,
.ext-term-desc ol {
  margin: 0.4em 0;
  padding-left: 1.35em;
}

.ext-term-desc li {
  margin: 0.15em 0;
}

.ext-term-desc li > p {
  margin: 0;
}

.ext-term-desc code {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ink, #1a2830) 8%, transparent);
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 0.9em;
}

.ext-term-desc blockquote {
  margin: 0.45em 0;
  padding-left: 0.75em;
  border-left: 3px solid color-mix(in srgb, currentColor 28%, transparent);
  color: var(--muted, #5a6b75);
}

/* 描述中出现的其他词条：底部关联标签 */
.ext-term-related {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.45rem;
  margin-top: 0.45em;
  padding-top: 0.4em;
  border-top: 1px dashed color-mix(in srgb, currentColor 18%, transparent);
  font-size: 0.875rem;
  line-height: 1.4;
}

.ext-term-related-label {
  color: var(--muted, #5a6b75);
  user-select: none;
}

.ext-term-related-tag {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: inherit;
  cursor: pointer;
}

.ext-term-related-tag:hover {
  text-decoration: underline;
}

/* 正文词条引用：蓝色 + []，点击弹出描述 */
.ext-term-ref {
  color: #2563eb;
  cursor: pointer;
  text-decoration: none;
}

.ext-term-ref::before {
  content: '[';
}

.ext-term-ref::after {
  content: ']';
}

.ext-term-popover {
  position: fixed;
  z-index: 10000;
  box-sizing: border-box;
  width: max-content;
  min-width: 300px;
  max-width: 500px;
  min-height: 150px;
  height: auto;
  max-height: min(320px, calc(100vh - 1.5rem));
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font-size: 0.875rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  box-shadow: 0 8px 24px rgba(26, 40, 48, 0.14);
  pointer-events: auto;
}

html.dark .ext-term-ref,
[data-theme='dark'] .ext-term-ref,
html.dark .ext-term-related-tag,
[data-theme='dark'] .ext-term-related-tag {
  color: #60a5fa;
}

html.dark .ext-term-popover,
[data-theme='dark'] .ext-term-popover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
`

/** 注入 / 更新扩展样式（同 id 会覆盖） */
export function ensureTermGlossaryStyles(css: string = TERM_GLOSSARY_STYLES): void {
  if (typeof document === 'undefined') return
  let el = document.querySelector(
    `style[${STYLE_ATTR}="${TERM_GLOSSARY_ID}"]`,
  ) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.setAttribute(STYLE_ATTR, TERM_GLOSSARY_ID)
    document.head.appendChild(el)
  }
  el.textContent = css
}
