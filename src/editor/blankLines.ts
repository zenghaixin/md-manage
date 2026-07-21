/**
 * TipTap 空段 ↔ 落盘真空行（Typora 风格），双向可逆，避免刷新空行膨胀。
 *
 * TipTap 段间 k 个空段（去掉 &nbsp; 行后的连续空行数 E）：
 *   k = max(0, E - 2)
 * 落盘段间空行数 E'：
 *   E' = k + 1  （k=0 时 E'=1，即普通 A\n\nB）
 *
 * `::: ... :::` 围栏块（如词条）内部空行原样保留，不参与空段换算。
 */

function isNbspLine(line: string): boolean {
  const t = line.trim()
  return t === '&nbsp;' || t === '\u00a0'
}

function isEmptyLine(line: string): boolean {
  return line.trim() === ''
}

function isGapLine(line: string): boolean {
  return isEmptyLine(line) || isNbspLine(line)
}

/** k 个空段 → TipTap 段间行（插在两个正文行之间） */
function tipTapGapLines(k: number): string[] {
  if (k <= 0) return ['']
  // k=1: A,'' ,'' ,'' ,B
  // k=2: A,'','','',nbsp,'',B
  const lines: string[] = ['', '', '']
  for (let i = 1; i < k; i += 1) {
    lines.push('&nbsp;', '')
  }
  return lines
}

/** k 个空段 → 落盘段间空行 */
function storageGapLines(k: number): string[] {
  if (k <= 0) return ['']
  return Array.from({ length: k + 1 }, () => '')
}

function mapGaps(
  lines: string[],
  mapRun: (gapLines: string[], atStart: boolean, atEnd: boolean) => string[],
): string[] {
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    if (!isGapLine(lines[i])) {
      out.push(lines[i])
      i += 1
      continue
    }
    const start = i
    while (i < lines.length && isGapLine(lines[i])) i += 1
    out.push(...mapRun(lines.slice(start, i), start === 0, i === lines.length))
  }
  return out
}

function emptyLineCount(gapLines: string[]): number {
  return gapLines.filter((l) => isEmptyLine(l) && !isNbspLine(l)).length
}

/** TipTap / 混合间隙 → k */
function tipTapGapToK(gapLines: string[]): number {
  // 先逻辑上去掉 nbsp 再数空行
  const empties = emptyLineCount(gapLines)
  return Math.max(0, empties - 2)
}

/** 落盘间隙 → k（不应含 nbsp） */
function storageGapToK(gapLines: string[]): number {
  const empties = emptyLineCount(gapLines)
  return Math.max(0, empties - 1)
}

/** 是否为 ::: 围栏起始行 */
function isFenceOpen(line: string): boolean {
  return /^:::[\t ]*\S/.test(line)
}

/** 是否为 ::: 围栏结束行 */
function isFenceClose(line: string): boolean {
  return /^:::[\t ]*$/.test(line)
}

/**
 * 按 ::: 围栏切段：fence 原样保留，text 才做空段换算。
 */
function mapOutsideFences(
  lines: string[],
  mapTextLines: (textLines: string[]) => string[],
): string[] {
  const out: string[] = []
  let i = 0
  let textBuf: string[] = []

  const flushText = () => {
    if (!textBuf.length) return
    out.push(...mapTextLines(textBuf))
    textBuf = []
  }

  while (i < lines.length) {
    if (isFenceOpen(lines[i])) {
      flushText()
      out.push(lines[i])
      i += 1
      while (i < lines.length) {
        out.push(lines[i])
        if (isFenceClose(lines[i])) {
          i += 1
          break
        }
        i += 1
      }
      continue
    }
    textBuf.push(lines[i])
    i += 1
  }
  flushText()
  return out
}

function mapTextGapsToStorage(lines: string[]): string[] {
  return mapGaps(lines, (gap, atStart, atEnd) => {
    const k = tipTapGapToK(gap)
    if (atStart && atEnd) {
      return storageGapLines(k)
    }
    if (atStart) {
      return k <= 0 ? [] : Array.from({ length: k }, () => '')
    }
    if (atEnd) {
      // 文末：去掉 TipTap 尾随空段，只保留一个收尾换行习惯
      return ['']
    }
    return storageGapLines(k)
  })
}

function mapTextGapsFromStorage(lines: string[]): string[] {
  return mapGaps(lines, (gap, atStart, atEnd) => {
    if (atStart && atEnd) {
      const k = storageGapToK(gap)
      return tipTapGapLines(k)
    }
    if (atStart) {
      const k = gap.length
      if (k <= 0) return []
      return tipTapGapLines(k)
    }
    if (atEnd) {
      // 文末只保留收尾换行，不还原成可编辑空段（避免刷新后词条下方又冒出空行）
      return ['']
    }
    const k = storageGapToK(gap)
    return tipTapGapLines(k)
  })
}

/** 去掉文末多余空行，只留一个换行（join 后表现为文件尾 \n） */
function trimTrailingGaps(lines: string[]): string[] {
  if (!lines.length) return lines
  let end = lines.length
  while (end > 0 && isGapLine(lines[end - 1])) end -= 1
  if (end === lines.length) return lines
  // 若全文非空，保留一个收尾空行；全文皆空则清空
  if (end === 0) return ['']
  return [...lines.slice(0, end), '']
}

/** 编辑器 Markdown → 落盘（无 &nbsp;） */
export function toStorageMarkdown(markdown: string): string {
  if (!markdown) return ''
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const mapped = mapOutsideFences(lines, mapTextGapsToStorage)
  return trimTrailingGaps(mapped).join('\n')
}

/** 落盘 Markdown → 编辑器（还原 TipTap 空段） */
export function fromStorageMarkdown(markdown: string): string {
  if (!markdown) return ''
  // 落盘不应含 &nbsp;；若有旧文件残留，先丢掉再按真空行计数
  const lines = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !isNbspLine(l))

  const mapped = mapOutsideFences(lines, mapTextGapsFromStorage)
  return trimTrailingGaps(mapped).join('\n')
}
