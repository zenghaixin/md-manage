# 通用组件目录

新增 UI / 浮层 / 选区交互前，先查本目录（及 `src/editor/components/`）是否已有可复用实现；**有则复用，禁止平行再写一套**。

**硬性约定（见 `.cursor/rules/shared-components.mdc`）：**  
在 `src/components/` 下新增可复用组件，或改动其对外 API 时，**同一改动必须同步更新本文件**。未更新 README 视为任务未完成。

**分层：**

| 层级 | 路径 | 说明 |
|------|------|------|
| 应用壳 UI | `src/components/` | 本目录 |
| 编辑器通用宿主 | `src/editor/components/` | 预留；与业务无关、仅编辑器内用的 UI |
| 扩展私有 UI | `src/editor/extensions/<id>/` | 业务浮层封装；底层仍用本目录通用组件 |

对照检查：目录表中每个通用组件都应有对应专章。

| 组件 / 模块 | 路径 | 用途一句话 |
|-------------|------|------------|
| **拖拽弹窗** | `draggable-float/` | 预览 / 编辑 / 备注等可拖弹窗（见专章） |
| **数字快捷键气泡** | `key-picker/` | 1–9 选项菜单（见专章） |
| `AppIcon` | `AppIcon.vue` | Iconify 图标，别名见 `src/icons.js` |
| `PaneSplitter` | `PaneSplitter.vue` | 竖向可拖拽分割条 |
| `MarkdownField` | `MarkdownField.vue` | 轻量 Markdown 编辑（预览 ↔ 源码） |
| `selection-actions` | `selection-actions/` | 编辑器选区气泡 |
| `FileSidebar` 等 | 见文末 | **壳专用**，扩展勿直接 import |

---

## 拖拽弹窗

路径：**`src/components/draggable-float/`**，统一从 `index.ts` 导出。

词条预览、编辑、备注等**所有可拖拽弹窗**都用这一套。扩展只在 `extensions/<id>/` 里写业务内容，**挂到** `DraggableFloat` **上**，不要另写 `position: fixed` 平行浮层。

### 组成（一个目录，四个实现文件 + index）

| 文件 | 职责 |
|------|------|
| `DraggableFloat.vue` | UI：标题栏拖动、关闭、插槽、可选改尺寸 |
| `floatCascade.ts` | 多窗怎么排：来源右侧平行 / +28 错开 / 首扇拖走重置 |
| `floatZIndex.ts` | 多个浮层谁在最上：打开、聚焦时递增 z-index |
| `openFloatHost.ts` | body 级挂载：`createApp` + 级联登记 + Pinia/ElementPlus + teardown |
| `index.ts` | 统一导出入口 |

`floatCascade`、`floatZIndex`、`openFloatHost` 写成纯 TS，是因为级联状态和 z 计数要**跨多个浮层实例共享**，且 `allocateCascadePlace` 在 Vue 挂载前就要算好坐标——不适合塞进 SFC 里。

### 快速决策

| 需求 | 做法 |
|------|------|
| 做一个可拖弹窗（body 挂载） | **`openFloatHost`**（推荐）或下方「手动接入」 |
| 选区上的小气泡 | `selection-actions`（不走拖拽弹窗） |
| 居中模态 / `el-dialog` | 另选；非拖拽弹窗场景 |

### 标准接入（推荐）

扩展浮层挂到 `document.body` 时，用 `openFloatHost` 统一处理级联、z-index、Pinia/ElementPlus 与 teardown：

```ts
import {
  openFloatHost,
  closeFloatHost,
  nextFloatZIndex,
} from '@/components/draggable-float'
import MyFloatHost from './MyFloatHost.vue'

const FLOAT_ID = 'my-feature-float'
let mount = openFloatHost({
  cascadeId: FLOAT_ID,
  width: 380,
  height: 560,
  besideRect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
  rootClassName: 'ext-my-float-root',
  component: MyFloatHost,
  props: ({ place, zIndex }) => ({
    floatLeft: place.left,
    floatTop: place.top,
    zIndex,
    onClose: () => closeFloatHost(mount),
    onFocus: () => mount.host.setZIndex?.(nextFloatZIndex()),
  }),
})

// 关闭：closeFloatHost(mount)
// 改标题换 cascade id：mount.setCascadeId('new-id')
```

### 手动接入（仅当 openFloatHost 不适用时）

```ts
import DraggableFloat from '@/components/draggable-float/DraggableFloat.vue'
import {
  allocateCascadePlace,
  registerCascadeFloat,
  unregisterCascadeFloat,
  nextFloatZIndex,
} from '@/components/draggable-float'

const FLOAT_ID = 'my-feature-float'
const W = 380
const H = 560

// 1. 打开前算位置（必须传来源矩形）
const r = anchorEl.getBoundingClientRect()
const place = allocateCascadePlace({
  width: W,
  height: H,
  besideRect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
})

// 2. 挂载 DraggableFloat（:left :top 用 place；@focus 里抬 z-index）
// 3. 挂载后 registerCascadeFloat(FLOAT_ID, () => floatRef.getBoundingClientRect())
// 4. 关闭时 unregisterCascadeFloat(FLOAT_ID)
```

每个打开入口**自行**传 `besideRect` / `anchorRect`（点击元素、父浮层、光标 coords 等），没有全局「点哪弹哪」。

### 级联规则

1. 无有效首扇 + 有来源 → 来源**右侧平行**（`top` 与来源一致）
2. 有有效首扇且未拖动 → 相对首扇 **+28/+28** 右下错开
3. 首扇被用户拖走过 → 取消首扇，下一扇重新按 1)

细则见 `.cursor/rules/float-cascade.mdc`。

### DraggableFloat（UI 壳）

无遮罩、非模态；标题栏拖动；`@focus` 时配合 `nextFloatZIndex()` 置顶。

**属性**

| 属性 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `title` | String | `''` | 标题栏 |
| `width` | Number | `360` | 宽 px |
| `height` | Number \| null | `null` | 高；null 随内容（受 maxHeight 限） |
| `minWidth` / `minHeight` | Number | `220` / `120` | 最小尺寸 |
| `maxHeight` | Number | `500` | 自适应高度上限 |
| `zIndex` | Number | `10050` | 初始 z-index |
| `left` / `top` | Number \| null | `null` | 初始位置；与 `allocateCascadePlace` 结果对应 |
| `resizable` | Boolean | `false` | 可拖改尺寸 |
| `rootClass` | String | `''` | 根 class |
| `dataTermTitle` | String | `''` | 根节点 `data-term-title` |

**事件：** `close` · `focus` · `resize`

**插槽：** `default`（主体）· `footer`（底栏，可选）

**expose：** `flash()` · `setZIndex(z)` · `setPosition(left, top)` · `getBoundingClientRect()` · `rootEl`

### 挂载 API（`openFloatHost.ts`）

| 导出 | 说明 |
|------|------|
| `openFloatHost(opts)` | 创建 body 根节点、算位置、createApp、登记 cascade；返回 `FloatHostMount` |
| `closeFloatHost(mount)` | 注销 cascade、unmount、移除根节点 |
| `FloatHostMount.setCascadeId(id)` | 预览改标题等：更换 cascade 登记 id |
| `FloatHostMount.host` | Vue 宿主 expose（`flash` / `bringFront` / `getBoundingClientRect` 等） |

### 级联 API（`floatCascade.ts`）

| 导出 | 说明 |
|------|------|
| `allocateCascadePlace({ width, height, besideRect?, anchorRect? })` | 分配 `{ left, top }` |
| `registerCascadeFloat(id, getRect)` | 挂载后登记 |
| `unregisterCascadeFloat(id)` | 关闭时注销 |
| `placeParallel(source, width)` | 仅「来源右侧平行」 |
| `CASCADE_GAP` / `CASCADE_DOWN` | 间距 8 / 28 |

### 层叠 API（`floatZIndex.ts`）

| 导出 | 说明 |
|------|------|
| `nextFloatZIndex()` | 递增并返回（打开 / 聚焦时） |
| `peekFloatZIndex()` | 当前值，不递增 |

预览 / 编辑 / 备注共用同一计数器。

### 参考实现

| 场景 | 文件 |
|------|------|
| 预览 | `extensions/term-glossary/core/dialog/TermPreviewFloat.vue` |
| 编辑 | `extensions/term-glossary/core/panel/TermEditorFloatHost.vue` |
| 备注 | `extensions/remark/RemarkFloat.vue` |

---

## AppIcon

Iconify 封装。

| 属性 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `name` | String | `''` | `src/icons.js` 别名 |
| `icon` | String | `''` | Iconify 名；优先于 `name` |
| `size` | Number \| String | `'1em'` | 宽高 |

```vue
<AppIcon name="folder" :size="16" />
```

新图标在 `src/icons.js` 加别名。

---

## PaneSplitter

竖向分割条；父级监听 `@dragstart` / `@drag` / `@dragend` 调侧栏宽。

```vue
<PaneSplitter @dragstart="onLeftDragStart" @drag="onLeftDrag" />
```

---

## MarkdownField

小块 Markdown 编辑（TipTap lite）。主文档用 `MarkdownEditor`（壳）。

| 属性 | 默认 | 说明 |
|------|------|------|
| `modelValue` | `''` | v-model |
| `termRef` | `false` | 启用 termRef 节点 |
| `hostTermTitle` | `''` | 描述内同名不灰线（经 `editor/hostTermTitle`） |
| `placeholder` | `'支持 Markdown'` | |
| `minHeight` | `160` | px |
| `showToggle` | `true` | 预览/源码切换 |

---

## selection-actions

编辑器选区气泡；扩展 `registerSelectionAction`，**不走**拖拽弹窗。

```ts
registerSelectionAction({
  id: 'my-action',
  label: '备注',
  order: 20,
  isVisible: (ctx) => ctx.text.length > 0,
  run: (ctx) => { /* view, from, to, text, coords */ },
})
```

参考：`remark/bridgeExtension.ts`、`term-glossary/core/panel/notTermAction.ts`。

---

## key-picker

路径：**`src/components/key-picker/`**。数字快捷键气泡（非 Vue 组件）。

- **`getKeyPicker()`**：全应用单例，正文确认 / 预览候选等共用，避免叠两个气泡
- **`picker.show({ anchor, items | titles, onPick, sourceId?, ... })`**
- 关闭预览等宿主时：若 `currentSourceId` 匹配，仅 `hide()` 该来源，不影响编辑器内气泡

与 `selection-actions`（选区文字按钮）不同；与 `draggable-float`（可拖弹窗）不同。

```ts
import { getKeyPicker, KEY_PICKER_CLASS } from '@/components/key-picker'

getKeyPicker().show({
  anchor: elementOrRect,
  label: '确认是否为词条',
  titles: ['词条A', '词条B'],
  sourceId: 'my-feature',
  onPick: (value) => { /* ... */ },
})
```

---

## 壳专用组件

与 `DocsPage` 强耦合；扩展用 `shellEvents` / `rightPanelRegistry`，勿直接 import。

| 组件 | 说明 |
|------|------|
| `FileSidebar` / `FileTreeNode` | 左栏文件树 + 大纲 |
| `MarkdownEditor` | 主文档编辑器 |
| `OpsSidePanel` | 右栏书签宿主 |
| `SettingsModal` | 主题设置 |

---

## 检查清单

- [ ] 弹窗需求已走「拖拽弹窗」专章全流程，未平行写 fixed 浮层
- [ ] 打开处传了来源矩形
- [ ] 新/改通用组件已更新本 README
- [ ] 未在壳里写死扩展逻辑
