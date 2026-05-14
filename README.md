# 🦞学霸帝Claw - local ai agent

基于 ByteDance UI-TARS 的本地智能桌面助手 macOS 应用。

## 功能特点

- 🤖 **AI 驱动** - 基于 UI-TARS-1.5-7B 模型，理解屏幕内容
- 🖱️ **精准控制** - 控制鼠标、键盘，截取屏幕截图
- 🔒 **隐私安全** - 完全本地运行，屏幕内容不上传
- 💻 **macOS 原生** - 原生应用，支持 Apple Silicon

## 系统要求

- macOS 11.0 (Big Sur) 或更高版本
- Apple Silicon 或 Intel 处理器
- 16GB 以上内存（推荐）

## 安装

### 方法一：下载预构建版本

从 [GitHub Releases](https://github.com/xuebadi/xueba-tars-desktop/releases) 下载最新的 DMG 文件。

### 方法二：从源码构建

```bash
# 克隆仓库
git clone https://github.com/xuebadi/xueba-tars-desktop.git
cd xueba-tars-desktop

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建 DMG
npm run build:mac
```

## 模型配置

### 下载 UI-TARS-1.5-7B 模型

从以下任一地址下载模型：
- [HuggingFace](https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B)
- [ModelScope](https://www.modelscope.cn/models)

### 启动推理服务器

#### 使用 vLLM

```bash
pip install vllm

python -m vllm.entrypoints.openai.api_server \
  --model ByteDance-Seed/UI-TARS-1.5-7B \
  --port 8000 \
  --tensor-parallel-size 1
```

#### 使用 Ollama

```bash
brew install ollama
ollama serve
# 导入下载的模型
ollama create ui-tars -f Modelfile
ollama run ui-tars
```

### 在应用中配置

1. 打开「设置」
2. 在「模型设置」中填入 API 端点（如 `http://localhost:8000/v1`）
3. 保存设置

## 使用说明

### 快捷操作

- 点击「快捷操作」卡片快速执行常用任务
- 在输入框中输入自然语言指令
- AI 将自动分析屏幕并执行任务

### 本地控制

- 鼠标控制：移动、点击、滚动
- 键盘控制：输入文字、快捷键
- 操作录制：录制一系列操作并回放

### 快捷键

- `Cmd+N` - 新建任务
- `Cmd+,` - 打开设置
- `Cmd+W` - 关闭窗口
- `Cmd+Q` - 退出应用

## 开发

### 项目结构

```
xueba-tars-desktop/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # 预加载脚本
│   └── renderer/       # React 前端
├── resources/          # 应用资源（图标等）
├── build/              # 构建资源
├── scripts/            # 构建脚本
└── package.json
```

### 技术栈

- Electron + React + TypeScript
- electron-vite
- electron-builder

## License

Apache-2.0 License

## 致谢

本项目基于 ByteDance 的 [UI-TARS](https://github.com/bytedance/UI-TARS) 开源项目开发。
