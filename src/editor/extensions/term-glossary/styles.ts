/**
 * term-glossary 编辑态样式。
 * 标题与描述默认换行：标题一行，描述从下一行开始。
 */
export const TERM_GLOSSARY_STYLES = `
.ext-term-node {
  display: block;
  margin: 0.35em 0;
  padding-left: 0.55em;
  border-left: 2px solid color-mix(in srgb, currentColor 28%, transparent);
  cursor: default;
}

.ext-term-node.is-selected {
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-left-color: color-mix(in srgb, currentColor 55%, transparent);
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
`
