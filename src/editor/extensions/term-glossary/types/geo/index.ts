import type { TermSpecialDef } from '../shared'

export const geoSpecial = {
  id: 'geo',
  label: '地理',
  key: '5',
  fields: [
    {
      key: 'kind',
      label: '类别',
      kind: 'enum',
      defaultValue: 'other',
      options: [
        { id: 'region', label: '区域' },
        { id: 'settlement', label: '聚落' },
        { id: 'landmark', label: '地标' },
        { id: 'other', label: '其它' },
      ],
      inSummary: true,
    },
  ],
} as const satisfies TermSpecialDef<'geo'>
