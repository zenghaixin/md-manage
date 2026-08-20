import type { TermSpecialDef } from '../shared'

export const skillSpecial = {
  id: 'skill',
  label: '技能',
  key: '4',
  fields: [
    {
      key: 'kind',
      label: '类别',
      kind: 'enum',
      defaultValue: 'other',
      options: [
        { id: 'active', label: '主动' },
        { id: 'passive', label: '被动' },
        { id: 'other', label: '其它' },
      ],
      inSummary: true,
    },
  ],
} as const satisfies TermSpecialDef<'skill'>
