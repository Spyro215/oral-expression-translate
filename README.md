# Oral Expression Translate

Windows 桌面悬浮翻译 MVP，用于游戏、影视字幕和不可复制文本里的地道英文表达。

## 功能

- `Ctrl + Shift + E` 全局快捷键进入截图框选。
- 本地 OCR 识别英文，只把识别出的文字发送给 OpenAI-compatible 模型。
- 返回自然中文译法、语气/潜台词、表达解释和直译。
- 本地保存历史记录与收藏。
- 托盘入口可打开截图翻译、历史记录和设置。

## 运行

```bash
pnpm install
pnpm electron:dev
```

如果只想检查类型：

```bash
pnpm typecheck
```

## 设置

首次启动会打开设置页，填写：

- `API Key`
- `Base URL`，默认 `https://api.openai.com/v1`
- `Model`，默认 `gpt-4.1-mini`
- `Hotkey`，默认 `CommandOrControl+Shift+E`

## 隐私边界

截图只在本机用于 OCR。发送到模型接口的是 OCR 后的英文文本，不上传截图。

当前 OCR 使用 `tesseract.js` 作为第一版轻量本地实现。后续可以把 OCR 层替换为 PaddleOCR 命令行或本地服务，渲染层和翻译层无需重写。
