import type { TermSpecialDef } from '../shared'

export const eventSpecial = {
  id: 'event',
  label: '历史事件',
  key: '6',
  fields: [
    {
      key: 'timeLabel',
      label: '时间',
      kind: 'text',
      defaultValue: '',
      inSummary: true,
    },
    {
      key: 'status',
      label: '状态',
      kind: 'enum',
      defaultValue: 'past',
      options: [
        { id: 'past', label: '过去' },
        { id: 'ongoing', label: '进行中' },
        { id: 'future', label: '未来' },
        { id: 'myth', label: '传说' },
      ],
      inSummary: true,
    },
  ],
} as const satisfies TermSpecialDef<'event'>
