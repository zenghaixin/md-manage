# Docs · Vue3 Markdown 文档管理器

本地文档管理工具：顶部标签对应文件夹，标签下的文件对应 Markdown，支持页面编辑与自动保存。

## 启动

```bash
npm install
npm run dev
```

- 前端：http://localhost:5173
- 文件 API：http://localhost:3001
- 文档根目录：项目下的 `md/`

## 功能

1. **顶部标签**：新建标签时在 `md/` 下创建同名文件夹
2. **文件页面**：在当前标签文件夹下新建 `.md` 文件
3. **编辑保存**：点击文件读取内容，编辑后每 3 秒自动写入对应 Markdown

## 目录示例

```
md/
  工作笔记/
    周报.md
    会议记录.md
  个人/
    待办.md
```
