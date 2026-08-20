import type { TermSpecialDef } from '../shared'

export const classSpecial = {
  id: 'class',
  label: '职业',
  key: '3',
  fields: [
    {
      key: 'kind',
      label: '类别',
      kind: 'enum',
      defaultValue: 'other',
      options: [
        { id: 'combat', label: '战斗' },
        { id: 'support', label: '辅助' },
        { id: 'craft', label: '制作' },
        { id: 'other', label: '其它' },
      ],
      inSummary: true,
    },
  ],
} as const satisfies TermSpecialDef<'class'>
