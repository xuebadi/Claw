# 学霸帝Claw 模型服务器

基于 UI-TARS-1.5-7B 的本地模型推理服务器，提供 OpenAI 兼容 API。

## 架构

```
HTTP Client / Desktop App
       ↓
FastAPI Server (:8000) — OpenAI 兼容 API 代理
       ↓
llama-server (:8765) — 本地推理（CPU）
       ↓
UI-TARS-1.5-7B-q4_k_m.gguf + mmproj
```

## 前置要求

- macOS / Linux
- Python 3.9+
- [llama.cpp](https://github.com/ggerganov/llama.cpp) (`llama-server`)
  - macOS: `brew install llama.cpp`
- 模型文件（见下方下载）

## 快速启动

### 1. 下载模型

```bash
cd model-server
python3 scripts/download_model.py
```

模型下载到 `~/.xuebadi/models/gguf/` 目录。

### 2. 启动 llama-server

```bash
llama-server \
  -m ~/.xuebadi/models/gguf/UI-TARS-1.5-7B-q4_k_m.gguf \
  --mmproj ~/.xuebadi/models/gguf/UI-TARS-1.5-7B-q8_0.mmproj \
  --host 127.0.0.1 --port 8765 \
  -ngl 0 -c 2048 -t 4
```

> `-ngl 0` 强制 CPU 推理（Intel Mac 无 Metal 支持）

### 3. 启动 API 服务器

```bash
cd model-server
pip3 install -r requirements.txt
PYTHONPATH="$PWD/src" python3 -m uvicorn src.server:app --host 0.0.0.0 --port 8000
```

## API 端点

| 端点 | 说明 |
|------|------|
| `POST /v1/chat/completions` | OpenAI 兼容对话 API |
| `GET /health` | 健康检查 |
| `GET /api/status` | 服务器状态 |
| `GET /api/gguf/models` | 可用 GGUF 模型列表 |
| `GET /` | Web 控制面板 |

## 模型

- **UI-TARS-1.5-7B** (ByteDance Seed)
- GGUF 量化版本（Q4_K_M, Q5_K_M, Q8_0, BF16）
- 来源: [ModelScope](https://modelscope.cn/models/Mungert/UI-TARS-1.5-7B-GGUF)
- 支持 **视觉理解**（需配套 mmproj 文件）

## 注意事项

- Intel Mac 上必须使用 `-ngl 0` 禁用 GPU 层（Metal 不兼容 Intel iGPU）
- llama-cpp-python 在 Intel Mac 上会因 Metal 崩溃，本方案改用 llama-server 绕过
- 建议至少 8GB 内存（Q4_K_M 模型约 4.4GB）
