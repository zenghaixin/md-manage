import type { TermSpecialDef } from '../shared'

export const characterSpecial = {
  id: 'character',
  label: '角色',
  key: '1',
  fields: [
    {
      key: 'status',
      label: '状态',
      kind: 'enum',
      defaultValue: 'unknown',
      options: [
        { id: 'alive', label: '在世' },
        { id: 'dead', label: '已故' },
        { id: 'unknown', label: '未知' },
      ],
      inSummary: true,
    },
    {
      key: 'summary',
      label: '短简介',
      kind: 'text',
      defaultValue: '',
      inSummary: true,
    },
  ],
} as const satisfies TermSpecialDef<'character'>
