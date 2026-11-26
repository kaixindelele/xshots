# Xshots · 推评截图

一键将 X / Twitter 单条推文，或**「主帖 + 多选精彩评论」**合并生成高清 PNG 分享卡片，直接写入系统剪贴板。**100% 本地渲染，零构建、零登录、零追踪。**

## 效果预览

| 多选主帖与神评 | 一键合并生成高清卡片 |
| :---: | :---: |
| <img src="./assets/demo-select.jpg" alt="多选主帖与评论" width="380" /> | <img src="./assets/demo-result.jpg" alt="合并生成的柔雾卡片" width="380" /> |

## 核心特性

- **推评多选合图（核心亮点）**：点击帖子或评论右上角的 `+` 按钮，可跨屏自由勾选主帖与多条神评（内置虚拟滚动快照保护），一键拼接成干净连贯的高清长图。
- **单帖即点即拷**：每条帖子右上角自动注入相机按钮，点击即刻复制高清卡片，支持后台复制（无需保持窗口在前台）。
- **三种画布 × 三档清晰度**：支持「柔雾」「夜幕」「原色」三种风格与 `1× / 2× / 3×` 倍率，自动适配 X 浅色/深色/纯黑主题。
- **细节自由开关**：可随时开关底部互动数据、原帖来源链接，并支持自定义右下角轻量水印（默认留空）。

## 安装方式（无需构建）

1. 下载本项目源码（或在 [Releases](https://github.com/kaixindelele/xshots/releases) 中下载 `Xshots-1.0.0.zip` 并解压到固定目录）。
2. 在 Chrome / Edge / Brave 地址栏打开 `chrome://extensions`。
3. 开启右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择包含 `manifest.json` 的 `Xshots` 文件夹。
5. 打开或刷新 `x.com` 页面即可使用。

## 使用说明

1. **多选推文与评论合图**：依次点击主帖和评论右上角的 `+` 按钮加入多选，再点击底部悬浮条的 **合并截图**（或打开右上角扩展弹窗点击合并复制）。
2. **单帖快速截图**：点击任意帖子右上角「…」左侧的相机图标，提示「已复制到剪切板」后即可在微信、飞书、文档中直接粘贴。
3. **样式设置**：点击浏览器工具栏中的 **Xshots** 图标，实时预览并切换画布风格、清晰度、互动数据、来源链接与自定义水印。

> **提示**：遇到折叠长帖请先点击「显示更多」展开后再截图；视频会自动截取当前画面或使用封面图。

## 目录结构

```text
Xshots/
├── manifest.json       # Chrome Manifest V3 配置
├── shared.js           # 默认配置、参数校验与倍率计算
├── content.js          # 按钮注入、推评多选快照、DOM 克隆渲染与卡片合成
├── content.css         # 注入按钮样式隔离
├── background.js       # X 官方图床安全拉取与复制队列调度
├── offscreen.html/js   # 后台剪贴板 PNG 写入
├── popup.html/css/js   # 扩展设置与实时预览面板
├── icons/              # 扩展图标
├── vendor/             # 本地打包的 html2canvas 1.4.1 (MIT)
└── scripts/pack.ps1    # 一键打包发布 ZIP 脚本
```

## 打包发布

在 PowerShell 中运行以下命令，即可生成可直接发布的干净安装包 `dist/Xshots-1.0.0.zip`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/pack.ps1
```

## 隐私与开源协议

- 详见 [PRIVACY.md](./PRIVACY.md)
- 基于 [MIT License](./LICENSE) 开源
