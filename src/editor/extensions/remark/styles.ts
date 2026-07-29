/*
 * 默认：淡黄字 + 下划线。
 * 编辑 / 卡片悬停：继承正文色（勿用 --ink，编辑区正文是 typora 的 #34495e），
 * 背景用极淡中性色，避免黄底把字衬亮。
 */
const STYLE_ATTR = 'data-ext-remark'
const STYLE_ID = 'remark'

const CSS = `
.ext-remark {
  color: #ca8a04;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, #ca8a04 65%, transparent);
  text-decoration-thickness: 1.25px;
  text-underline-offset: 0.18em;
}

.md-editor .tiptap-prose .ext-remark.ext-remark-active,
.md-editor .tiptap-prose .ext-remark.ext-remark-hover {
  color: inherit;
  text-decoration-color: color-mix(in srgb, currentColor 35%, transparent);
  background: color-mix(in srgb, #fde68a 18%, transparent);
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0 0.08em;
}

/* 右栏备注卡片 hover：整块词条边框高亮（含标题） */
.md-editor .tiptap-prose .ext-term-node:has(.ext-remark.ext-remark-hover),
.md-editor .tiptap-prose .ext-term-node.ext-remark-block-hover,
.md-editor .tiptap-prose .ext-term-node.ext-remark-active {
  outline: 2px solid color-mix(in srgb, #ca8a04 75%, transparent);
  outline-offset: 2px;
  border-radius: 4px;
}

.md-editor .tiptap-prose .ext-term-node:has(.ext-remark.ext-remark-hover) .ext-remark.ext-remark-hover {
  background: transparent;
  padding: 0;
}
`

export function ensureRemarkStyles(): void {
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
