/**
 * term-glossary 编辑态样式。
 * 标题与描述默认换行：标题一行，描述从下一行开始。
 */
import { TERM_GLOSSARY_ID } from './constants'

const STYLE_ATTR = 'data-ext-style'

export const TERM_GLOSSARY_STYLES = `
.ext-term-node {
  position: relative;
  display: block;
  margin: 0.35em 0 16px;
  padding: 0.15em 2.5rem 0.15em 0.55em;
  border-left: 2px solid color-mix(in srgb, currentColor 28%, transparent);
  cursor: pointer;
}

.ext-term-node.is-selected {
  background: color-mix(in srgb, #3b82f6 12%, transparent);
  border-left-color: #3b82f6;
  border-radius: 4px;
}

.ext-term-actions {
  position: absolute;
  top: 0.1rem;
  right: 0.2rem;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.ext-term-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--muted, #5a6b75);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}

.ext-term-action-btn:hover {
  color: #2563eb;
}

.ext-term-action-btn.is-danger:hover {
  color: #dc2626;
}

.ext-term-node.is-flash {
  animation: ext-term-node-flash 1.2s ease;
  border-radius: 4px;
}

@keyframes ext-term-node-flash {
  0%, 100% {
    background: transparent;
    outline: 2px solid transparent;
    outline-offset: 2px;
    border-left-color: color-mix(in srgb, currentColor 28%, transparent);
  }
  12%, 38%, 62% {
    background: color-mix(in srgb, #f59e0b 28%, transparent);
    outline: 2px solid #f59e0b;
    outline-offset: 2px;
    border-left-color: #f59e0b;
  }
  25%, 50%, 75% {
    background: color-mix(in srgb, #3b82f6 26%, transparent);
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
    border-left-color: #3b82f6;
  }
}

html.dark .ext-term-node.is-flash,
[data-theme='dark'] .ext-term-node.is-flash {
  animation-name: ext-term-node-flash-dark;
}

@keyframes ext-term-node-flash-dark {
  0%, 100% {
    background: transparent;
    outline: 2px solid transparent;
    outline-offset: 2px;
    border-left-color: color-mix(in srgb, currentColor 28%, transparent);
  }
  12%, 38%, 62% {
    background: color-mix(in srgb, #fbbf24 32%, transparent);
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
    border-left-color: #fbbf24;
  }
  25%, 50%, 75% {
    background: color-mix(in srgb, #60a5fa 30%, transparent);
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
    border-left-color: #60a5fa;
  }
}

.ext-term-header {
  display: block;
}

.ext-term-title-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.15em;
}

.ext-term-type-badge {
  flex-shrink: 0;
  padding: 0.05em 0.4em;
  border: 1px solid color-mix(in srgb, var(--accent, #0d6e6e) 40%, var(--border, #c5d0d8));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-soft, #d4ecec) 80%, transparent);
  color: var(--accent, #0d6e6e);
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
  user-select: none;
  pointer-events: none;
}

.ext-term-label {
  display: none;
}

.ext-term-title {
  display: block;
  flex: 1;
  min-width: 0;
  width: auto;
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
  cursor: pointer;
  user-select: none;
}

.ext-term-desc {
  display: block;
  margin-top: 0.15em;
  min-height: 1.2em;
  font-weight: inherit;
  color: inherit;
  cursor: pointer;
  user-select: none;
  caret-color: transparent;
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

/* 已确认引用：蓝色 + []，右上角可取消 */
.ext-term-ref {
  position: relative;
  /* inline-block：便于浏览器在 atom 边界区分光标，减轻输入法整颗替换 */
  display: inline-block;
  color: #2563eb;
  cursor: pointer;
  text-decoration: none;
  padding-right: 0.55em;
  user-select: none;
  vertical-align: baseline;
}

.ext-term-ref::before {
  content: '[';
}

.ext-term-ref::after {
  content: ']';
}

.ext-term-ref-text {
  display: inline;
}

.ext-term-ref-close {
  position: absolute;
  top: -0.55em;
  right: -0.15em;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.9em;
  height: 0.9em;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, #2563eb 18%, transparent);
  color: #2563eb;
  font-size: 0.7em;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}

.ext-term-ref:hover .ext-term-ref-close,
.ext-term-ref.is-selected .ext-term-ref-close {
  opacity: 1;
  pointer-events: auto;
}

.ext-term-ref-close:hover {
  background: #2563eb;
  color: #fff;
}

/*
 * 统一虚线：.ext-term-dash + .ext-term-dash--{kind}
 * 新增颜色：加 kind 常量 + 一组 CSS 变量即可。
 */
.ext-term-dash {
  color: inherit;
  cursor: pointer;
  border-bottom: 1.5px dashed var(--term-dash, #94a3b8);
  text-decoration: none;
}

.ext-term-dash:hover {
  border-bottom-color: var(--term-dash-hover, var(--term-dash));
  background: color-mix(in srgb, var(--term-dash) 14%, transparent);
}

.ext-term-dash--candidate {
  --term-dash: #94a3b8;
  --term-dash-hover: #64748b;
}

.ext-term-dash--former {
  --term-dash: #d97706;
  --term-dash-hover: #b45309;
}

html.dark .ext-term-dash--former,
[data-theme='dark'] .ext-term-dash--former {
  --term-dash: #f59e0b;
  --term-dash-hover: #fbbf24;
}

.ext-term-dash--invalid {
  --term-dash: #dc2626;
  --term-dash-hover: #b91c1c;
  color: #dc2626;
}

.ext-term-ref.ext-term-dash--invalid::before,
.ext-term-ref.ext-term-dash--invalid::after {
  color: #dc2626;
}

.ext-term-ref.ext-term-dash--invalid .ext-term-ref-close {
  background: color-mix(in srgb, #dc2626 18%, transparent);
  color: #dc2626;
}

.ext-term-ref.ext-term-dash--invalid .ext-term-ref-close:hover {
  background: #dc2626;
  color: #fff;
}

.ext-term-not-term {
  position: fixed;
  z-index: 10020;
  margin: 0;
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font-size: 0.8125rem;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(26, 40, 48, 0.14);
}

.ext-term-not-term:hover {
  border-color: #dc2626;
  color: #dc2626;
}

.ext-term-popover {
  position: fixed;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 400px;
  height: auto;
  max-height: 500px;
  min-width: 220px;
  min-height: 120px;
  padding: 0;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 8px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font-size: 0.875rem;
  line-height: 1.45;
  word-break: break-word;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(26, 40, 48, 0.18);
  pointer-events: auto;
  transition: border-color 0.15s ease;
}

.ext-term-popover.is-flash {
  animation: ext-term-popover-flash 0.9s ease;
}

@keyframes ext-term-popover-flash {
  0%, 100% { border-color: var(--border, #c5d0d8); }
  20%, 60% { border-color: #f59e0b; box-shadow: 0 0 0 2px color-mix(in srgb, #f59e0b 35%, transparent), 0 12px 32px rgba(26, 40, 48, 0.18); }
  40%, 80% { border-color: #2563eb; box-shadow: 0 0 0 2px color-mix(in srgb, #2563eb 35%, transparent), 0 12px 32px rgba(26, 40, 48, 0.18); }
}

.ext-term-popover-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
  min-height: 2.25rem;
  padding: 0.35rem 0.45rem 0.35rem 0.75rem;
  border-bottom: 1px solid var(--border, #c5d0d8);
  background: color-mix(in srgb, var(--surface, #f4f7f9) 88%, var(--ink, #1a2830));
  cursor: move;
  user-select: none;
  touch-action: none;
}

.ext-term-popover-header.is-dragging {
  cursor: grabbing;
}

.ext-term-popover-title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext-term-popover-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #6b7c88);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.ext-term-popover-close:hover {
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: var(--ink, #1a2830);
}

.ext-term-popover-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0.55rem 0.75rem;
  overflow: auto;
}

.ext-term-popover-desc {
  white-space: normal;
  color: inherit;
}

.ext-term-popover-desc > *:first-child {
  margin-top: 0;
}

.ext-term-popover-desc > *:last-child {
  margin-bottom: 0;
}

.ext-term-popover-desc p {
  margin: 0.35em 0;
}

.ext-term-popover-desc h1,
.ext-term-popover-desc h2,
.ext-term-popover-desc h3,
.ext-term-popover-desc h4 {
  margin: 0.45em 0 0.3em;
  font-weight: 700;
  line-height: 1.35;
}

.ext-term-popover-desc h1 { font-size: 1.2em; }
.ext-term-popover-desc h2 { font-size: 1.1em; }
.ext-term-popover-desc h3 { font-size: 1.05em; }
.ext-term-popover-desc h4 { font-size: 1em; }

.ext-term-popover-desc ul,
.ext-term-popover-desc ol {
  margin: 0.35em 0;
  padding-left: 1.25em;
}

.ext-term-popover-desc code {
  padding: 0.05em 0.3em;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 0.9em;
}

.ext-term-popover-desc strong {
  font-weight: 700;
}

.ext-term-popover-desc .ext-term-dash--candidate {
  color: inherit;
  cursor: pointer;
}

.ext-term-popover .ext-term-ref {
  color: #2563eb;
  cursor: pointer;
}

html.dark .ext-term-popover .ext-term-ref,
[data-theme='dark'] .ext-term-popover .ext-term-ref {
  color: #60a5fa;
}

.ext-term-popover-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0.3rem 0.55rem 0.35rem;
  border-top: 1px solid var(--border, #c5d0d8);
}

.ext-term-popover-footer-left,
.ext-term-popover-footer-right {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
}

.ext-term-popover-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #6b7c88);
  cursor: pointer;
}

.ext-term-popover-tool:hover,
.ext-term-popover-tool.is-active {
  background: color-mix(in srgb, currentColor 12%, transparent);
  color: var(--ink, #1a2830);
}

.ext-term-popover-tool:disabled {
  opacity: 0.45;
  cursor: default;
}

.ext-term-popover-action {
  margin: 0;
  padding: 0.15rem 0.55rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 4px;
  background: transparent;
  color: var(--ink, #1a2830);
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.3;
  cursor: pointer;
}

.ext-term-popover-action:hover {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.ext-term-popover-action.is-muted {
  color: var(--muted, #6b7c88);
}

.ext-term-popover-title-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.15rem 0.35rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: text;
}

.ext-term-popover-header .ext-term-popover-title-input {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ext-term-popover-source-input {
  display: block;
  width: 100%;
  min-height: 6rem;
  box-sizing: border-box;
  margin: 0;
  padding: 0.4rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 0.8rem;
  line-height: 1.45;
  resize: vertical;
}

/* 编辑态文案视图：与源码输入框同壳，内容为 TipTap 即时渲染 */
.ext-term-popover-desc-editor {
  display: block;
  width: 100%;
  min-height: 6rem;
  box-sizing: border-box;
  margin: 0;
  padding: 0.4rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 4px;
  overflow: auto;
  resize: vertical;
}

.ext-term-popover-desc-editor .ext-term-popover-tiptap,
.ext-term-popover-desc-editor .tiptap {
  outline: none;
  min-height: 4.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: inherit;
}

.ext-term-popover-desc-editor .ext-term-popover-tiptap > *:first-child,
.ext-term-popover-desc-editor .tiptap > *:first-child {
  margin-top: 0;
}

.ext-term-popover-desc-editor .ext-term-popover-tiptap > *:last-child,
.ext-term-popover-desc-editor .tiptap > *:last-child {
  margin-bottom: 0;
}

.ext-term-popover-desc-editor p {
  margin: 0.35em 0;
}

.ext-term-popover-desc-editor h1,
.ext-term-popover-desc-editor h2,
.ext-term-popover-desc-editor h3,
.ext-term-popover-desc-editor h4 {
  margin: 0.4em 0 0.25em;
  font-weight: 700;
  line-height: 1.35;
}

.ext-term-popover-desc-editor h1 { font-size: 1.2em; }
.ext-term-popover-desc-editor h2 { font-size: 1.1em; }
.ext-term-popover-desc-editor h3 { font-size: 1.05em; }
.ext-term-popover-desc-editor h4 { font-size: 1em; }

.ext-term-popover-desc-editor ul,
.ext-term-popover-desc-editor ol {
  margin: 0.35em 0;
  padding-left: 1.25em;
}

.ext-term-popover-desc-editor code {
  padding: 0.05em 0.3em;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 0.9em;
}

.ext-term-popover-source-view {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 0.8rem;
  line-height: 1.45;
  color: inherit;
}

/* 边框拖拽改尺寸 */
.ext-term-popover-resize {
  position: absolute;
  z-index: 2;
}

.ext-term-popover-resize-e {
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
}

.ext-term-popover-resize-s {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 6px;
  cursor: ns-resize;
}

.ext-term-popover-resize-se {
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

.ext-term-popover-resize-se::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 7px;
  height: 7px;
  border-right: 2px solid color-mix(in srgb, currentColor 35%, transparent);
  border-bottom: 2px solid color-mix(in srgb, currentColor 35%, transparent);
}

html.dark .ext-term-ref,
[data-theme='dark'] .ext-term-ref {
  color: #60a5fa;
}

html.dark .ext-term-ref-close,
[data-theme='dark'] .ext-term-ref-close {
  background: color-mix(in srgb, #60a5fa 22%, transparent);
  color: #60a5fa;
}

html.dark .ext-term-ref-close:hover,
[data-theme='dark'] .ext-term-ref-close:hover {
  background: #60a5fa;
  color: #0f172a;
}

html.dark .ext-term-dash--invalid,
html.dark .ext-term-ref.ext-term-dash--invalid,
[data-theme='dark'] .ext-term-dash--invalid,
[data-theme='dark'] .ext-term-ref.ext-term-dash--invalid {
  --term-dash: #f87171;
  --term-dash-hover: #fca5a5;
  color: #f87171;
}

html.dark .ext-term-dash--candidate,
[data-theme='dark'] .ext-term-dash--candidate {
  --term-dash: #64748b;
  --term-dash-hover: #94a3b8;
}

html.dark .ext-term-not-term,
[data-theme='dark'] .ext-term-not-term {
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}

html.dark .ext-term-popover,
[data-theme='dark'] .ext-term-popover {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

html.dark .ext-term-popover.is-flash,
[data-theme='dark'] .ext-term-popover.is-flash {
  animation-name: ext-term-popover-flash-dark;
}

@keyframes ext-term-popover-flash-dark {
  0%, 100% { border-color: var(--border, #3a4650); }
  20%, 60% { border-color: #fbbf24; box-shadow: 0 0 0 2px color-mix(in srgb, #fbbf24 40%, transparent), 0 12px 32px rgba(0, 0, 0, 0.5); }
  40%, 80% { border-color: #60a5fa; box-shadow: 0 0 0 2px color-mix(in srgb, #60a5fa 40%, transparent), 0 12px 32px rgba(0, 0, 0, 0.5); }
}

/* 词条定义不完整 */
.ext-term-node.is-incomplete {
  border-left-color: #dc2626;
  outline: 1px dashed color-mix(in srgb, #dc2626 55%, transparent);
  outline-offset: 2px;
  background: color-mix(in srgb, #dc2626 6%, transparent);
}

.ext-term-node.is-incomplete::after {
  content: attr(data-incomplete-hint);
  display: block;
  margin-top: 0.25em;
  color: #dc2626;
  font-size: 0.8em;
  font-weight: 500;
}

/* 冲突审查面板容器（列表样式在 ConflictReviewPanel.vue scoped） */
.ext-term-conflict-panel-root,
.ext-term-conflict-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: transparent;
  color: var(--ink, #1a2830);
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
