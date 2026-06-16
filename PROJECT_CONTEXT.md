# PROJECT CONTEXT — Oral Expression Translate

> 本文档为接手的 AI 开发者提供完整的项目上下文，无需从头阅读所有源码。

---

## 1. 项目用途

Oral Expression Translate 是一款 **Windows 桌面悬浮翻译工具**，专为游戏玩家、影视观众设计——当屏幕上出现不可复制的英文字幕/台词/俚语时，用户按 `Ctrl+Shift+E` 框选区域，应用本地 OCR 识别英文文本，调用 OpenAI 兼容的 LLM 翻译成地道中文，并解释语气、潜台词和固定表达。

**核心场景**：游戏中遇到 "You've got to be kidding me" → 框选 → 得到 "你在逗我吧？" + 语气解释 + 俚语说明。

---

## 2. 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 桌面框架 | Electron | 37.10.3 |
| 打包 | electron-builder (NSIS) | 26.15.3 |
| 前端 | React 19 + TypeScript | react@19, ts@5.8 |
| 构建 | Vite 7 | @vitejs/plugin-react |
| OCR | tesseract.js (本地) | ^6.0.0 |
| 翻译 | OpenAI-compatible API | 用户可配 Base URL + Model |
| 存储 | SQLite (`node:sqlite`) → JSON 回退 | Electron 内置 |
| 图标 | lucide-react | ^0.468.0 |
| 包管理 | pnpm | 11.7+ |
| 图片处理 | sharp (仅构建脚本用) | ^0.35.1 |

---

## 3. 已实现功能

- [x] **全局热键截图** — `Ctrl+Shift+E` 触发全屏截图 → 鼠标拖拽框选区 → 裁剪 → 本地 OCR
- [x] **本地 OCR** — tesseract.js 英文识别，打包后用 bundled `eng.traineddata`
- [x] **LLM 翻译** — 发文本到 OpenAI-compatible 接口，要求返回 JSON 含翻译/语气/表达解释/直译
- [x] **手动输入翻译** — textarea 直接粘贴或输入英文
- [x] **历史记录** — SQLite 存储全部翻译历史，支持搜索和仅看收藏
- [x] **收藏** — 星标/取消星标翻译条目
- [x] **复制译文** — 一键复制翻译结果
- [x] **系统托盘** — 托盘图标 + 右键菜单（截图翻译/历史/设置/退出）
- [x] **设置页** — API Key / Base URL / Model / 快捷键 可配
- [x] **无边框窗口** — 自定义标题栏，支持拖拽移动、最小化、退出按钮
- [x] **自定义图标** — 托盘、任务栏、安装包均使用自定义 .ico
- [x] **Windows NSIS 安装包** — `pnpm dist` 生成 `.exe` 安装器，支持自定义安装目录，中文安装界面
- [x] **窗口常驻顶层** — `alwaysOnTop: true`

---

## 4. 文件结构与职责

```
oral-expression-translate/
├── index.html                  # Vite 入口 HTML
├── vite.config.ts              # Vite 配置，base="./"（生产必须用相对路径）
├── tsconfig.json               # 渲染进程 TS 配置（React JSX）
├── tsconfig.main.json          # 主进程 TS 配置（CommonJS）
├── package.json                # 依赖 + electron-builder 配置
├── pnpm-workspace.yaml         # pnpm 配置 + @electron/get override
├── eng.traineddata             # Tesseract 英文 OCR 语言包 (~5MB)
│
├── assets/                     # 图标资源（已提交到 git）
│   ├── icon.ico                # 多分辨率 Windows 图标（16/24/32/48/64/256）
│   ├── tray-16.png             # 16px 托盘图标
│   └── tray-32.png             # 32px 托盘图标（HiDPI）
│
├── scripts/
│   └── generate-icons.mjs      # 从源 PNG 生成 .ico + 托盘 PNG（用 sharp）
│
├── src/
│   ├── shared/
│   │   └── types.ts            # 所有跨进程共享的类型定义
│   │       - AppView: "result" | "history" | "settings" | "capture"
│   │       - TranslationResult: 模型返回的原始 JSON 结构
│   │       - HistoryItem: 展平后的历史记录条目
│   │       - AppSettings: apiKey, baseUrl, model, hotkey
│   │       - AppApi: 完整的 preload bridge 接口
│   │
│   ├── main/
│   │   ├── main.ts             # Electron 主进程（窗口管理、托盘、IPC、热键）
│   │   ├── settings.ts         # 设置持久化（JSON 文件，userData 目录）
│   │   ├── store.ts            # 历史存储（SQLite → JSON 回退双模式）
│   │   └── translator.ts       # 调用 OpenAI-compatible API 翻译
│   │
│   ├── preload/
│   │   └── preload.ts          # contextBridge 桥接层（ipcRenderer.invoke 封装）
│   │
│   └── renderer/
│       ├── main.tsx            # 全部 React UI（单文件，~360 行）
│       └── styles.css          # 全部样式（~320 行）
│
├── dist/                       # 构建产物（被 .gitignore 忽略）
│   ├── main/                   # 主进程编译输出
│   └── renderer/               # Vite 渲染进程输出
│
└── release/                    # 打包产物（被 .gitignore 忽略）
    └── Oral Expression Translate Setup 0.1.0.exe
```

---

## 5. 架构关键点

### 5.1 窗口管理
- 主窗口（resultWindow）：430×560，无边框，常驻顶层
- 截图窗口（captureWindow）：全屏，透明背景，覆盖整个主显示器
- 关闭主窗口实际上是 `hide()`，不是 `destroy()`；只有 `isQuitting=true` 时才真正退出
- 首次启动打开 **设置页**（而非翻译页）——因为用户必须先配 API Key

### 5.2 IPC 通道命名

| 通道 | 方向 | 用途 |
|---|---|---|
| `capture:full-screen` | 渲染→主 | 截取全屏返回 dataURL |
| `capture:start` | 渲染→主 | 打开截图窗口 |
| `capture:close` | 渲染→主 | 关闭截图窗口 |
| `capture:started` | 主→渲染 | 通知截图窗口就绪 |
| `ocr:image` | 渲染→主 | 传入裁剪图片 dataURL，返回 OCR 文本 |
| `translate:text` | 渲染→主 | 翻译文本，返回 HistoryItem |
| `history:list` / `history:favorite` / `history:delete` | 渲染→主 | 历史 CRUD |
| `settings:get` / `settings:save` | 渲染→主 | 设置读写 |
| `window:show-result` / `window:minimize` | 渲染→主 | 窗口控制 |
| `app:quit` | 渲染→主 | 退出程序 |
| `view:open` | 渲染→主 | 切换到指定视图 |
| `clipboard:write` | 渲染→主 | 复制文本到剪贴板 |

### 5.3 OCR 数据流
```
热键/按钮 → 全屏截图(dataURL) → 鼠标框选 → cropImage()裁剪 → ocr:image IPC
→ main.ts createWorker("eng", {langPath}) → tesseract.recognize()
→ 提取文本 → translate:text IPC → translator.ts → LLM API → 返回结果
```

### 5.4 tesseract.js langPath 判断
```ts
const langPath = app.isPackaged
  ? process.resourcesPath                           // 打包后：resources/
  : path.join(__dirname, "../../..");               // 开发：项目根目录
```
- `eng.traineddata` 开发时在项目根目录，打包后通过 `extraResources` 放到 `resources/`

### 5.5 rendererUrl 路径
```ts
// 生产环境必须用 pathToFileURL()，不能手动拼 file:// 字符串
// Windows 路径含反斜杠，手动拼接会导致 file://D:/... 格式错误
function rendererUrl(view: AppView) {
  if (isDev) return `${devUrl}?view=${view}`;
  return `${pathToFileURL(path.join(__dirname, "../../renderer/index.html")).href}?view=${view}`;
}
```

### 5.6 Vite 的 base 必须是 `"./"` 
`vite.config.ts` 中 `base: "./"` 是必须的——没有这个，生产 HTML 引用的是 `/assets/xxx.js`（绝对路径），在 `file://` 协议下会 404 → 白屏。

### 5.7 存储双模式
`store.ts` 尝试加载 `node:sqlite`（Node 22+ 内置），失败则回退到 JSON 文件。两种模式接口完全一致：`add()`, `list()`, `get()`, `toggleFavorite()`, `delete()`。

### 5.8 @electron/get 版本兼容
`pnpm-workspace.yaml` 中 `overrides: "@electron/get": "~3.1.0"` 是必须的——electron-builder 26.15.3 依赖 `@electron/get@^3.0.0`，默认解析到 3.0.0，该版本缺少 `ElectronDownloadCacheMode.ReadWrite` 导致打包失败。

---

## 6. 已知问题 / 待改进

1. **翻译结果窗口不能自动弹出** — capture 完成后调用 `showResultWindow()`，但有概率窗口不出现（需排查 IPC 时序）
2. **快捷键被占用时静默失败** — 只打 warn 日志，对用户无感知
3. **只有英文 OCR** — `eng.traineddata` 已 bundle，无法识别中文等其他语言
4. **截图只支持主显示器** — `screen.getPrimaryDisplay()` 硬编码
5. **没有错误重试机制** — OCR/翻译失败直接抛错，未重试
6. **设置页首次启动体验** — 首次打开直接显示设置页是对的，但没有引导文案
7. **包体积较大** — 110MB（主要是 Electron + Chromium + node_modules in asar）
8. **UI 未做响应式** — 固定 430×560，小屏幕可能溢出

---

## 7. 下一步开发建议

| 优先级 | 建议 | 难度 |
|---|---|---|
| 高 | 截图完成后确保翻译窗口弹出（可能是窗口焦点问题，尝试 `resultWindow?.show()` + `focus()`） | 低 |
| 高 | 翻译失败时显示更友好的错误信息（目前是原始 HTTP 状态码） | 低 |
| 中 | 拆离 `main.tsx` 为多文件：`App.tsx`, `ResultView.tsx`, `HistoryView.tsx`, `SettingsView.tsx`, `CaptureOverlay.tsx` | 中 |
| 中 | 支持多显示器截图 | 中 |
| 中 | 快捷键注册失败时在设置页提示（通过 IPC 通知渲染进程） | 低 |
| 低 | 支持其他语言 OCR（如中文 `chi_sim`） | 中 |
| 低 | 添加自动更新（electron-updater + latest.yml 已生成） | 高 |
| 低 | 允许关闭 `alwaysOnTop`（在设置页加开关） | 低 |

---

## 8. 常用命令

```bash
pnpm dev              # 仅启动 Vite 开发服务器（不含 Electron）
pnpm electron:dev     # 完整开发环境（Vite + Electron 并行）
pnpm build            # 生产构建
pnpm dist             # 构建 + 打包 NSIS 安装包
pnpm typecheck        # TypeScript 类型检查
node scripts/generate-icons.mjs  # 重新生成图标（需要 assets/source.png）
```

---

## 9. 环境注意事项

- `.npmrc` 配置了 `electron_mirror=https://npmmirror.com/mirrors/electron/`（中国镜像加速）
- 移除 `pnpm-workspace.yaml` 中的 `@electron/get` override 会导致打包失败
- `release/` 目录不在 git 中，需要本地运行 `pnpm dist` 重新打包
- 首次运行需要设置 API Key（窗口默认打开设置页）
- SSH 已配置，远程地址为 `git@github.com:Spyro215/oral-expression-translate.git`
