import type { TermSpecialDef } from '../shared'

export const itemSpecial = {
  id: 'item',
  label: '装备',
  key: '7',
  fields: [
    {
      key: 'slot',
      label: '部位',
      kind: 'enum',
      defaultValue: 'other',
      options: [
        { id: 'weapon', label: '武器' },
        { id: 'armor', label: '防具' },
        { id: 'accessory', label: '饰品' },
        { id: 'consumable', label: '消耗' },
        { id: 'other', label: '其它' },
      ],
      inSummary: true,
    },
    {
      key: 'rarity',
      label: '稀有度',
      kind: 'enum',
      defaultValue: 'none',
      options: [
        { id: 'common', label: '普通' },
        { id: 'uncommon', label: '优秀' },
        { id: 'rare', label: '稀有' },
        { id: 'epic', label: '史诗' },
        { id: 'legendary', label: '传说' },
        { id: 'unique', label: '唯一' },
        { id: 'none', label: '无' },
      ],
      inSummary: true,
    },
  ],
} as const satisfies TermSpecialDef<'item'>
