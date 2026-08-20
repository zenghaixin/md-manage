import type { TermSpecialDef } from '../shared'

export const factionSpecial = {
  id: 'faction',
  label: '阵营',
  key: '2',
  fields: [
    {
      key: 'scale',
      label: '规模',
      kind: 'enum',
      defaultValue: 'other',
      options: [
        { id: 'org', label: '组织' },
        { id: 'nation', label: '国家' },
        { id: 'force', label: '势力' },
        { id: 'other', label: '其它' },
      ],
      inSummary: true,
    },
  ],
} as const satisfies TermSpecialDef<'faction'>
