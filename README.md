# 灯塔单词 · Beacon

> 照亮你背单词的路 — Light the way to every word

一个纯前端、零依赖的背单词小程序：数据全部存在浏览器本地（IndexedDB），不需要后端，单文件即可分享给别人使用。

## ✨ 功能

- **三大模块**：开始学习 / 复习 / 导入单词
- **间隔重复学习**：按反应时间计分（秒答 +2、较快 +1、超时 −1），单词达到「锚定值」才算掌握；没掌握的词会在隔 2~3 个词后再次出现，直到学会
- **复习列表**：每个词带记忆进度圆环、英 / 美双音标、词性与释义，整齐对齐
- **三套界面主题**：默认暖色 / 科幻科技感 / 小清新，随时切换
- **难度曲线**：一条滑条调节每个词的目标阈值，适配不同基础
- **导入方式**：手动粘贴 / 拍照 OCR 识别；导入时可自动获取音标、词性、例句
- **数据管理**：导出 / 导入备份（JSON）、一键清空
- 内置 50 个四级高频词作为初始单词书

## 🚀 使用

### 直接使用（推荐给普通用户）
双击根目录的 **`灯塔单词.html`** 即可在浏览器打开使用——它已把所有 JS / CSS 内联成一个文件，无需服务器。把这一个文件发给别人，对方双击也能用。

> 说明：核心功能（背词、复习、计分、主题、难度、本地数据）完全离线可用。需要联网的只有：网页字体（无网时回退系统字体）、拍照 OCR（首次从 CDN 加载识别引擎）、导入时在线获取音标 / 例句、以及自定义模型生成例句。
>
> 数据保存在「当前浏览器」里，换浏览器 / 换设备 / 清缓存会丢，重要数据请用「导出备份」。

## 🛠️ 开发

源码为模块化结构，位于 [`vocab-app/`](vocab-app/)。由于使用了 ES Modules，**不能直接双击 `vocab-app/index.html`**（浏览器会因 `file://` 的 CORS 限制拦截模块），需起一个本地静态服务器：

```bash
cd vocab-app
python -m http.server 8124
# 浏览器打开 http://localhost:8124
```

### 打包成单文件

```bash
cd vocab-app
python build_standalone.py
# 生成 ../灯塔单词.html
```

## 📁 结构

```
灯塔单词.html            # 打包后的单文件成品（双击即用）
vocab-app/
  index.html             # 入口
  css/                   # base / theme / components / review / study / import
  js/                    # app, study, review, import, database, settings, phonetics, ocr, llm, speech, utils
  build_standalone.py    # 打包脚本
```
