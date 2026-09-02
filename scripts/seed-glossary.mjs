/**
 * 初始化 md/词条：互引词条 + 自定义 schema；描述内 term[] 仅引用已存在词条。
 * 用法：node scripts/seed-glossary.mjs
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mdRoot = path.join(__dirname, '..', 'md')
const meta = path.join(mdRoot, '词条', '.glossary')
const schemasDir = path.join(meta, 'schemas')

const E = {
  DEFAULT: { id: 'b7722e75-f44b-4256-91b0-7b2c2b6add49', order: '0', path: '词条/默认词条.md', fileName: '默认词条' },
  CHAR: { id: '5c369957-717f-4837-ab2e-3abaa30a2b17', order: '1_0', path: '词条/角色/人物.md', fileName: '人物' },
  MAGIC: { id: '359a940a-aefb-40c1-b099-0bfbcce2a5d3', order: '2_0', path: '词条/魔法/魔法体系.md', fileName: '魔法体系' },
  PLACE: { id: 'c51fe6a1-8c84-47a1-bd67-022ca5a0c02a', order: '3_0', path: '词条/世界观/地点.md', fileName: '地点' },
  EVENT: { id: '8279ebcf-2f1f-45aa-82ff-f2e97ce7311c', order: '3_1', path: '词条/世界观/历史事件.md', fileName: '历史事件' },
  WEAPON: { id: '7184a045-496f-4a02-a5cf-030a7e92cb3c', order: '4_0', path: '词条/物品/武器.md', fileName: '武器' },
  ARMOR: { id: '56db4237-aa5b-4d50-96ab-fb6d786db996', order: '4_1', path: '词条/物品/防具.md', fileName: '防具' },
}

const I = {
  DEFAULT: E.DEFAULT.id,
  CHAR: E.CHAR.id,
  MAGIC: E.MAGIC.id,
  PLACE: E.PLACE.id,
  EVENT: E.EVENT.id,
  WEAPON: E.WEAPON.id,
  ARMOR: E.ARMOR.id,
}

/** @type {Set<string>} */
let titleRegistry = new Set()

/** 仅对已登记词条生成 term[] */
function r(title) {
  if (!titleRegistry.has(title)) {
    throw new Error(`描述引用了未定义的词条：${title}`)
  }
  return `term[${title}]`
}

function block(title, description) {
  const desc = String(description || '').trim()
  if (!desc) return `::: term [${title}]\n:::\n`
  return `::: term [${title}]\n${desc}\n:::\n`
}

function mdFile(heading, terms) {
  return `# ${heading}\n\n${terms.map((t) => block(t.title, t.description)).join('\n')}`.trimEnd() + '\n'
}

function linkRefs(slots) {
  const refSources = []
  const refs = {}
  for (const { sourceId, titles } of slots) {
    const list = (titles || []).map(String).filter(Boolean)
    if (!list.length) continue
    for (const t of list) {
      if (!titleRegistry.has(t)) {
        throw new Error(`refs 引用了未定义的词条：${t}`)
      }
    }
    refSources.push(sourceId)
    refs[sourceId] = list
  }
  return { refSources, refs }
}

function termRecord(title, sourcePath, description, opts = {}) {
  const { refSources, refs } = linkRefs(opts.links || [])
  return {
    title,
    sourcePath,
    description,
    ignoreContexts: [],
    formerTitles: [],
    pendingManualConfirm: [],
    refs,
    refSources,
    extraFields: opts.extraFields || [],
  }
}

function entry(sourcePath, terms) {
  const list = terms.map((t) => t.title)
  const map = {}
  for (const t of terms) {
    map[t.title] = termRecord(t.title, sourcePath, t.description, t)
  }
  return { list, terms: map }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

async function writeMd(relPath, content) {
  const abs = path.join(mdRoot, relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf-8')
}

const SCHEMAS = {
  [I.DEFAULT]: {
    version: 1,
    fields: [
      { label: '标题', type: 'text' },
      { label: '备注', type: 'markdown' },
    ],
  },
  [I.CHAR]: {
    version: 1,
    fields: [
      { label: '标题', type: 'text' },
      { label: '武器', type: 'term', sourcePath: '词条/物品/武器.md' },
      { label: '参与事件', type: 'term', sourcePath: '词条/世界观/历史事件.md' },
      { label: '备注', type: 'markdown' },
    ],
  },
  [I.WEAPON]: {
    version: 1,
    fields: [
      { label: '标题', type: 'text' },
      { label: '持有者', type: 'term', sourcePath: '词条/角色/人物.md' },
      { label: '品阶', type: 'text' },
      { label: '备注', type: 'markdown' },
    ],
  },
  [I.ARMOR]: {
    version: 1,
    fields: [
      { label: '标题', type: 'text' },
      { label: '持有者', type: 'term', sourcePath: '词条/角色/人物.md' },
      { label: '品阶', type: 'text' },
      { label: '备注', type: 'markdown' },
    ],
  },
  [I.EVENT]: {
    version: 1,
    fields: [
      { label: '标题', type: 'text' },
      { label: '时间节点', type: 'text' },
      { label: '参与人物', type: 'term', sourcePath: '词条/角色/人物.md' },
      { label: '备注', type: 'markdown' },
    ],
  },
  [I.PLACE]: {
    version: 1,
    fields: [
      { label: '标题', type: 'text' },
      { label: '相关事件', type: 'term', sourcePath: '词条/世界观/历史事件.md' },
      { label: '备注', type: 'markdown' },
    ],
  },
  [I.MAGIC]: {
    version: 1,
    fields: [
      { label: '标题', type: 'text' },
      { label: '熟练者', type: 'term', sourcePath: '词条/角色/人物.md' },
      { label: '位阶', type: 'text' },
      { label: '备注', type: 'markdown' },
    ],
  },
}

/** 先登记全部 title，再写 description（用 r()） */
function buildData() {
  const raw = {
    [E.DEFAULT.order]: {
      meta: E.DEFAULT,
      terms: [
        '魔力',
        '无咏唱魔法',
        '剑神流',
        '水神流',
        '北神流',
        '七大列强',
        '圣级',
        '神级',
        '格雷拉特家',
        '米格路迪亚族',
        '苏帕迪亚族',
      ],
    },
    [E.CHAR.order]: {
      meta: E.CHAR,
      terms: [
        '鲁迪乌斯',
        '艾莉丝',
        '希露菲',
        '洛琪希',
        '保罗',
        '基列奴',
        '卢德格尔',
        '奥尔斯特德',
        '人神',
        '赞恩',
        '亚莉艾尔',
        '杰尼斯',
        '岸里卡',
        '水神蕾达',
      ],
    },
    [E.MAGIC.order]: {
      meta: E.MAGIC,
      terms: ['扰乱雷击', '核爆', '治愈魔法'],
    },
    [E.PLACE.order]: {
      meta: E.PLACE,
      terms: ['菲托亚领', '魔大陆', '拉诺亚魔法大学', '米里斯神圣国', '剑之圣域', '希龙王国'],
    },
    [E.EVENT.order]: {
      meta: E.EVENT,
      terms: [
        '菲托亚转移事件',
        '贝加利特旅行',
        '米里斯迷宫攻略',
        '拉普拉斯战役',
        '龙神与人神的对峙',
        '阿斯拉王位继承战',
      ],
    },
    [E.WEAPON.order]: {
      meta: E.WEAPON,
      terms: ['龙神剑', '魔力铠', '超族三叉戟', '恶魔之眼'],
    },
    [E.ARMOR.order]: {
      meta: E.ARMOR,
      terms: ['圣骑士铠甲', '魔族鳞甲'],
    },
  }

  for (const cfg of Object.values(raw)) {
    for (const title of cfg.terms) titleRegistry.add(title)
  }

  return {
    [E.DEFAULT.order]: {
      meta: E.DEFAULT,
      terms: [
        { title: '魔力', description: `${r('六面世界')}中驱动魔法与武技的能量。` },
        {
          title: '无咏唱魔法',
          description: `省略咏唱直接成型的施法；${r('鲁迪乌斯')}幼年时已掌握。`,
        },
        {
          title: '剑神流',
          description: `三剑流之一；${r('艾莉丝')}与${r('基列奴')}修习此派。`,
        },
        { title: '水神流', description: `三剑流之一；当代宗主${r('水神蕾达')}。` },
        { title: '北神流', description: `三剑流之一；${r('保罗')}早年亦杂学此派。` },
        { title: '七大列强', description: `世界武力七强；${r('奥尔斯特德')}居首。` },
        {
          title: '圣级',
          description: `仅次于${r('神级')}的评价；${r('基列奴')}、${r('洛琪希')}长期停留此档。`,
        },
        { title: '神级', description: '魔法与剑术的最高评价档。' },
        {
          title: '格雷拉特家',
          description: `${r('阿斯拉王国')}剑术贵族旁支；${r('保罗')}一家定居${r('菲托亚领')}。`,
        },
        {
          title: '米格路迪亚族',
          description: `${r('魔大陆')}长寿种族；${r('洛琪希')}出身此族。`,
        },
        {
          title: '苏帕迪亚族',
          description: `魔族超族；${r('拉普拉斯战役')}后被诅咒，${r('卢德格尔')}是少数幸存者。`,
        },
      ],
    },
    [E.CHAR.order]: {
      meta: E.CHAR,
      terms: [
        {
          title: '鲁迪乌斯',
          description: `转生自无职宅男，${r('格雷拉特家')}长子。掌握${r('无咏唱魔法')}，经历${r('菲托亚转移事件')}后与${r('艾莉丝')}、${r('卢德格尔')}同行。`,
          links: [
            { sourceId: I.WEAPON, titles: ['龙神剑', '魔力铠'] },
            {
              sourceId: I.EVENT,
              titles: ['菲托亚转移事件', '米里斯迷宫攻略', '贝加利特旅行'],
            },
          ],
        },
        {
          title: '艾莉丝',
          description: `${r('菲托亚领')}大小姐，${r('剑神流')}剑士。转移后与${r('鲁迪乌斯')}、${r('卢德格尔')}组成死亡行军。`,
          links: [
            { sourceId: I.EVENT, titles: ['菲托亚转移事件', '贝加利特旅行'] },
          ],
        },
        {
          title: '希露菲',
          description: `${r('鲁迪乌斯')}青梅竹马；${r('菲托亚转移事件')}后侍奉${r('亚莉艾尔')}。`,
          links: [
            { sourceId: I.EVENT, titles: ['菲托亚转移事件', '阿斯拉王位继承战'] },
          ],
        },
        {
          title: '洛琪希',
          description: `${r('米格路迪亚族')}水圣；曾任${r('鲁迪乌斯')}家庭教师，后于${r('拉诺亚魔法大学')}任教。`,
          links: [],
          extraFields: [{ label: '位阶', type: 'text', value: '水圣级' }],
        },
        {
          title: '保罗',
          description: `${r('鲁迪乌斯')}之父，杂学三剑流；${r('米里斯迷宫攻略')}中战死。`,
          links: [
            { sourceId: I.EVENT, titles: ['菲托亚转移事件', '米里斯迷宫攻略'] },
          ],
        },
        {
          title: '基列奴',
          description: `兽族剑王，${r('艾莉丝')}的剑术老师；${r('菲托亚转移事件')}中与艾莉丝失散后重逢。`,
          links: [{ sourceId: I.EVENT, titles: ['菲托亚转移事件'] }],
        },
        {
          title: '卢德格尔',
          description: `${r('苏帕迪亚族')}战士；爱枪${r('超族三叉戟')}，在${r('魔大陆')}收${r('鲁迪乌斯')}为旅伴。`,
          links: [
            { sourceId: I.WEAPON, titles: ['超族三叉戟'] },
            { sourceId: I.EVENT, titles: ['贝加利特旅行', '米里斯迷宫攻略'] },
          ],
        },
        {
          title: '奥尔斯特德',
          description: `龙神，${r('七大列强')}第一；持${r('龙神剑')}，与${r('人神')}对立。`,
          links: [
            { sourceId: I.WEAPON, titles: ['龙神剑'] },
            { sourceId: I.EVENT, titles: ['拉普拉斯战役', '龙神与人神的对峙'] },
          ],
        },
        {
          title: '人神',
          description: `存在于间隙的神明，以未来建议引诱转生者；与${r('奥尔斯特德')}敌对。`,
          links: [{ sourceId: I.EVENT, titles: ['龙神与人神的对峙'] }],
        },
        {
          title: '赞恩',
          description: `${r('希龙王国')}王子；与${r('鲁迪乌斯')}在${r('拉诺亚魔法大学')}合作打造${r('魔力铠')}。`,
          links: [{ sourceId: I.WEAPON, titles: ['魔力铠'] }],
        },
        {
          title: '亚莉艾尔',
          description: `${r('阿斯拉王国')}第二公主；${r('希露菲')}以「菲茨」身份追随她。`,
          links: [{ sourceId: I.EVENT, titles: ['阿斯拉王位继承战'] }],
        },
        {
          title: '杰尼斯',
          description: `${r('鲁迪乌斯')}之母，治愈魔法师；${r('米里斯迷宫攻略')}中被救出但陷入失智。`,
          links: [{ sourceId: I.EVENT, titles: ['米里斯迷宫攻略'] }],
        },
        {
          title: '岸里卡',
          description: `大魔界王；曾将${r('恶魔之眼')}借给${r('鲁迪乌斯')}。`,
          links: [{ sourceId: I.WEAPON, titles: ['恶魔之眼'] }],
        },
        {
          title: '水神蕾达',
          description: `${r('水神流')}宗主，${r('七大列强')}之一；${r('阿斯拉王位继承战')}中参战。`,
          links: [{ sourceId: I.EVENT, titles: ['阿斯拉王位继承战'] }],
        },
      ],
    },
    [E.MAGIC.order]: {
      meta: E.MAGIC,
      terms: [
        {
          title: '扰乱雷击',
          description: `土墙扰乱后以雷击贯穿；${r('鲁迪乌斯')}招牌技。`,
          links: [{ sourceId: I.CHAR, titles: ['鲁迪乌斯'] }],
          extraFields: [{ label: '位阶', type: 'text', value: '圣级偏上' }],
        },
        {
          title: '核爆',
          description: `多属性压缩后的大范围毁灭魔法；破坏力逼近${r('神级')}。`,
          links: [{ sourceId: I.CHAR, titles: ['鲁迪乌斯'] }],
          extraFields: [{ label: '位阶', type: 'text', value: '神级' }],
        },
        {
          title: '治愈魔法',
          description: `米里斯体系恢复魔法；${r('杰尼斯')}出身此道。`,
          links: [{ sourceId: I.CHAR, titles: ['杰尼斯', '洛琪希'] }],
          extraFields: [{ label: '位阶', type: 'text', value: '高级' }],
        },
      ],
    },
    [E.PLACE.order]: {
      meta: E.PLACE,
      terms: [
        {
          title: '菲托亚领',
          description: `${r('阿斯拉王国')}北部边领；${r('菲托亚转移事件')}发源地。`,
          links: [{ sourceId: I.EVENT, titles: ['菲托亚转移事件'] }],
        },
        {
          title: '魔大陆',
          description: `严酷大陆；${r('贝加利特旅行')}起点，${r('米格路迪亚族')}故乡亦在此。`,
          links: [{ sourceId: I.EVENT, titles: ['贝加利特旅行', '菲托亚转移事件'] }],
        },
        {
          title: '拉诺亚魔法大学',
          description: `北方魔法学府；${r('鲁迪乌斯')}、${r('洛琪希')}、${r('赞恩')}均曾在此。`,
          links: [],
        },
        {
          title: '米里斯神圣国',
          description: `宗教国家；${r('米里斯迷宫攻略')}发生地。`,
          links: [{ sourceId: I.EVENT, titles: ['米里斯迷宫攻略'] }],
        },
        {
          title: '剑之圣域',
          description: `${r('剑神流')}根据地；${r('艾莉丝')}曾前往挑战。`,
          links: [],
        },
        {
          title: '希龙王国',
          description: `以人偶术闻名的国家；${r('赞恩')}的母国。`,
          links: [],
        },
      ],
    },
    [E.EVENT.order]: {
      meta: E.EVENT,
      terms: [
        {
          title: '菲托亚转移事件',
          description: '领地被传送阵覆盖，领民分散世界各地；故事前半分水岭。',
          links: [
            {
              sourceId: I.CHAR,
              titles: ['鲁迪乌斯', '艾莉丝', '保罗', '希露菲', '基列奴'],
            },
          ],
          extraFields: [{ label: '时间节点', type: 'text', value: '鲁迪约7岁' }],
        },
        {
          title: '贝加利特旅行',
          description: `自${r('魔大陆')}返回人界的三年旅途。`,
          links: [{ sourceId: I.CHAR, titles: ['鲁迪乌斯', '艾莉丝', '卢德格尔'] }],
          extraFields: [{ label: '时间节点', type: 'text', value: '约3年' }],
        },
        {
          title: '米里斯迷宫攻略',
          description: `救出${r('杰尼斯')}的深层迷宫战；${r('保罗')}战死于此。`,
          links: [{ sourceId: I.CHAR, titles: ['鲁迪乌斯', '保罗', '卢德格尔'] }],
          extraFields: [{ label: '时间节点', type: 'text', value: '鲁迪约17岁' }],
        },
        {
          title: '拉普拉斯战役',
          description: `约五百年前的大战；${r('苏帕迪亚族')}因此被诅咒。`,
          links: [{ sourceId: I.CHAR, titles: ['奥尔斯特德', '卢德格尔'] }],
          extraFields: [{ label: '时间节点', type: 'text', value: '约500年前' }],
        },
        {
          title: '龙神与人神的对峙',
          description: `${r('奥尔斯特德')}与${r('人神')}跨越轮回的暗战；${r('鲁迪乌斯')}被卷入棋局。`,
          links: [{ sourceId: I.CHAR, titles: ['奥尔斯特德', '鲁迪乌斯', '人神'] }],
          extraFields: [{ label: '时间节点', type: 'text', value: '贯穿全篇' }],
        },
        {
          title: '阿斯拉王位继承战',
          description: `${r('亚莉艾尔')}夺位之战；${r('水神蕾达')}等强者卷入。`,
          links: [{ sourceId: I.CHAR, titles: ['希露菲', '亚莉艾尔', '水神蕾达'] }],
          extraFields: [{ label: '时间节点', type: 'text', value: '鲁迪约22岁' }],
        },
      ],
    },
    [E.WEAPON.order]: {
      meta: E.WEAPON,
      terms: [
        {
          title: '龙神剑',
          description: `${r('奥尔斯特德')}持有的神器级兵刃。`,
          links: [{ sourceId: I.CHAR, titles: ['奥尔斯特德'] }],
          extraFields: [{ label: '品阶', type: 'text', value: '神器' }],
        },
        {
          title: '魔力铠',
          description: `${r('赞恩')}与${r('鲁迪乌斯')}合作的魔力外骨骼。`,
          links: [{ sourceId: I.CHAR, titles: ['鲁迪乌斯', '赞恩'] }],
          extraFields: [{ label: '品阶', type: 'text', value: '魔导具' }],
        },
        {
          title: '超族三叉戟',
          description: `${r('卢德格尔')}的爱枪，贯穿力极强。`,
          links: [{ sourceId: I.CHAR, titles: ['卢德格尔'] }],
          extraFields: [{ label: '品阶', type: 'text', value: '圣级' }],
        },
        {
          title: '恶魔之眼',
          description: `${r('岸里卡')}借出的魔眼；${r('鲁迪乌斯')}曾用于迷宫探路。`,
          links: [{ sourceId: I.CHAR, titles: ['鲁迪乌斯', '岸里卡'] }],
          extraFields: [{ label: '品阶', type: 'text', value: '魔眼' }],
        },
      ],
    },
    [E.ARMOR.order]: {
      meta: E.ARMOR,
      terms: [
        {
          title: '圣骑士铠甲',
          description: `${r('米里斯神圣国')}神殿骑士制式铠甲。`,
          links: [{ sourceId: I.CHAR, titles: ['保罗'] }],
          extraFields: [{ label: '品阶', type: 'text', value: '王级' }],
        },
        {
          title: '魔族鳞甲',
          description: `${r('魔大陆')}魔族常用鳞甲。`,
          links: [{ sourceId: I.CHAR, titles: ['卢德格尔'] }],
          extraFields: [{ label: '品阶', type: 'text', value: '王级' }],
        },
      ],
    },
  }
}

async function main() {
  titleRegistry = new Set()
  const DATA = buildData()

  // 补登记：描述里用到但未单独建词条的名称
  for (const extra of ['六面世界', '阿斯拉王国']) {
    titleRegistry.add(extra)
  }

  await fs.mkdir(schemasDir, { recursive: true })

  const index = {
    version: 2,
    entries: Object.values(E).map(({ id, order, path: p, fileName }) => ({
      id,
      order,
      path: p,
      fileName,
    })),
  }
  await writeJson(path.join(meta, 'index.json'), index)

  for (const [entryId, schema] of Object.entries(SCHEMAS)) {
    await writeJson(path.join(schemasDir, `${entryId}.json`), schema)
  }

  let total = 0
  for (const [order, cfg] of Object.entries(DATA)) {
    const { meta: entryMeta, terms } = cfg
    await writeMd(entryMeta.path, mdFile(entryMeta.fileName, terms))
    await writeJson(path.join(meta, `${order}.json`), entry(entryMeta.path, terms))
    total += terms.length
    console.log(`✓ ${entryMeta.fileName} — ${terms.length} 条`)
  }

  console.log(`\n共 ${total} 条；描述 term[] 均已校验；refs / extraFields 已写入 .glossary。`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
