/**
 * 词条结构化字段展示行（schema 引用槽 + extraFields），预览弹窗与定义块共用。
 */
import { normalizeDocPath } from './glossaryPaths'
import {
  buildIndexMaps,
  normalizeRefSources,
  resolveRefSlots,
  type GlossaryIndexEntry,
  type TermRefs,
  type TermRefSources,
} from './termRefSlots'
import {
  fetchTermSchema,
  isRemarkSchemaField,
  isTermSchemaField,
  isTextSchemaField,
  isTitleSchemaField,
  type TermExtraField,
  type TermSchemaField,
} from './termSchema'

export type TermDisplayFieldRow =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'term'; label: string; titles: string[] }

function asTitles(value: string | string[] | undefined | null): string[] {
  if (Array.isArray(value)) {
    return value.map((s) => String(s ?? '').trim()).filter(Boolean)
  }
  const text = String(value ?? '').trim()
  return text ? [text] : []
}

export function formatTermFieldValue(
  value: string | string[] | undefined | null,
): string {
  if (Array.isArray(value)) return value.filter(Boolean).join('、')
  return String(value ?? '').trim()
}

export function buildTermDisplayFieldsFromData(opts: {
  schemaFields: TermSchemaField[]
  extraFields: TermExtraField[]
  refs: TermRefs
  refSources: TermRefSources
  indexEntries: GlossaryIndexEntry[]
}): TermDisplayFieldRow[] {
  const rows: TermDisplayFieldRow[] = []
  const { schemaFields, extraFields, refs, refSources, indexEntries } = opts
  const { idByPath } = buildIndexMaps(indexEntries)
  const schemaTextLabels = new Set<string>()
  const schemaTermSourcePaths = new Set<string>()

  for (const field of schemaFields) {
    if (isTitleSchemaField(field) || isRemarkSchemaField(field)) continue
    if (isTextSchemaField(field)) {
      schemaTextLabels.add(field.label)
      const extra = extraFields.find((e) => e.label === field.label)
      const text = formatTermFieldValue(extra?.value)
      if (text) rows.push({ kind: 'text', label: field.label, value: text })
      continue
    }
    if (isTermSchemaField(field)) {
      const sp = normalizeDocPath(field.sourcePath || '')
      if (sp) schemaTermSourcePaths.add(sp)
      const id = idByPath.get(sp)
      const titles = asTitles(id ? refs[id] : [])
      if (titles.length) rows.push({ kind: 'term', label: field.label, titles })
    }
  }

  if (!schemaFields.length) {
    const normalized = normalizeRefSources(refSources, indexEntries)
    for (const slot of resolveRefSlots(normalized, indexEntries)) {
      const titles = asTitles(refs[slot.id])
      if (titles.length) rows.push({ kind: 'term', label: slot.name, titles })
    }
  }

  for (const extra of extraFields) {
    if (schemaTextLabels.has(extra.label)) continue
    if (
      extra.type === 'term' &&
      schemaTermSourcePaths.has(normalizeDocPath(extra.sourcePath || ''))
    ) {
      continue
    }
    if (extra.type === 'term') {
      const titles = asTitles(extra.value)
      if (!titles.length) continue
      rows.push({
        kind: 'term',
        label: String(extra.label || '自定义').trim() || '自定义',
        titles,
      })
      continue
    }
    const text = formatTermFieldValue(extra.value)
    if (!text) continue
    rows.push({
      kind: 'text',
      label: String(extra.label || '自定义').trim() || '自定义',
      value: text,
    })
  }

  return rows
}

export async function buildTermDisplayFields(opts: {
  sourcePath: string
  extraFields?: TermExtraField[]
  refs?: TermRefs
  refSources?: TermRefSources
  indexEntries: GlossaryIndexEntry[]
}): Promise<TermDisplayFieldRow[]> {
  let schemaFields: TermSchemaField[] = []
  const path = String(opts.sourcePath || '').trim()
  if (path) {
    try {
      const data = await fetchTermSchema(path)
      schemaFields = data.schema.fields || []
    } catch {
      schemaFields = []
    }
  }
  return buildTermDisplayFieldsFromData({
    schemaFields,
    extraFields: opts.extraFields || [],
    refs: opts.refs || {},
    refSources: normalizeRefSources(opts.refSources, opts.indexEntries),
    indexEntries: opts.indexEntries,
  })
}
